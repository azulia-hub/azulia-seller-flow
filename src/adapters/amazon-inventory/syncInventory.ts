import { updateStockAlerts } from './alerts'
import { parseFbaInventoryPage } from './fbaInventoryParser'
import { parseFbmListingRecord } from './listingsInventoryParser'
import { fbaRecordsToCanonical, fbmRecordsToCanonical } from './toCanonicalInventory'
import { initialInventoryState, type InventoryState, type InventorySettings, type InventoryStorage } from './workspaceTypes'
import type { InventoryPageRequest, InventorySource } from './reader'
import type { SyncSnapshot } from '../amazon-report-sync/protocol'
/** One bounded optional phase of the existing pipeline. Source errors never escape into financial sync. */
export async function syncInventory(account:string, source:SyncSnapshot, storage:InventoryStorage, read:(job:InventoryPageRequest,signal:AbortSignal)=>Promise<Record<string,unknown>>, force=false):Promise<import('./alerts').StockAlert[]> {
  const key=`inventory:${account}`, settings=(await storage.get<InventorySettings>(`inventory-config:${account}`)).value
  let sellerId=settings?.sellerId
  if(!sellerId){for(const record of source.records){const meta=record.sellingPartnerMetadata as Record<string,unknown>|undefined;if(typeof meta?.sellingPartnerId==='string'){sellerId=meta.sellingPartnerId;break}}}
  const stop=Date.now()+18000, signal=AbortSignal.timeout(18000)
  for(const kind of ['fba','listings'] as InventorySource[]){
    if(Date.now()>stop-1000)break
    const entry=await storage.get<InventoryState>(key), state=entry.value??initialInventoryState(account), prior=state.sources[kind]
    if(state.account!==account)throw new Error('Inventory account mismatch.')
    if(!force&&prior&&Date.parse(prior.nextAttempt)>Date.now())continue
    if(kind==='listings'&&!sellerId){state.sources[kind]={lastSuccess:prior?.lastSuccess??null,nextAttempt:new Date(Date.now()+15*60000).toISOString(),complete:false,error:'Seller ID is not known yet. Financial sync or the Inventory settings can supply it.'};await storage.put(key,state,entry.version);continue}
    // Inventory nextTokens expire quickly. An expired checkpoint starts a fresh staged scan, never appends to old stock.
    let stage=prior?.stage&&Date.now()-Date.parse(prior.stage.started)<20000?prior.stage:undefined
    let pages=0
    try {
      do {
        const raw=await read({source:kind,sellerId,nextToken:stage?.nextToken},signal),at=new Date().toISOString()
        state.raw[kind]=[raw] // Keep unrecognized fields/rows even when normalization rejects this page.
        const context={sellerAccount:account,marketplace:'A21TJRUUN4KGV',observedAt:at}
        let token:string|null,items:InventoryState['items']
        if(kind==='fba'){const parsed=parseFbaInventoryPage(raw);if(parsed.totalReportedCount!==parsed.items.length)throw new Error('Inventory page contains records without a SKU. Raw response retained; previous stock is unchanged.');token=parsed.nextToken;items=fbaRecordsToCanonical(parsed.items,context)}
        else {
          if(!Array.isArray(raw.items))throw new Error('Unrecognized listing response; saved stock is retained.')
          const records=raw.items.map(parseFbmListingRecord).filter((item):item is NonNullable<typeof item>=>item!==null)
          if(records.length!==raw.items.length)throw new Error('Listing page contains records without a SKU. Raw response retained; previous stock is unchanged.')
          // Keep catalog identities even for FBA-only listings; FBM stock is created only for DEFAULT availability.
          items=fbmRecordsToCanonical(records,context)
          const pagination=raw.pagination as Record<string,unknown>|undefined
          token=typeof pagination?.nextToken==='string'?pagination.nextToken:null
        }
        const map=new Map((stage?.items??[]).map(item=>[item.id,item]));for(const item of items)map.set(item.id,item)
        const staged={started:stage?.started??at,nextToken:token??'',items:[...map.values()],raw:[...(stage?.raw??[]),raw]}
        if(staged.items.length>20000||JSON.stringify(staged.raw).length>24*1024*1024)throw new Error('Inventory scan exceeds the supported retained size; saved stock is retained.')
        if(!token){
          const old=new Map(state.items.map(item=>[item.id,item]))
          for(const item of staged.items){const before=old.get(item.id);if(!before||JSON.stringify(before.quantities)!==JSON.stringify(item.quantities))state.history.push({at,id:item.id,quantities:item.quantities})}
          const sourceName=kind==='fba'?'amazon-sp-api-fba-inventory':'amazon-sp-api-listings-fbm'
          state.items=[...state.items.filter(item=>item.provenance.source!==sourceName),...staged.items]
          state.raw[kind]=staged.raw
          // Retain at most 90 daily observations per item, latest sample in each day.
          const daily=new Map<string,InventoryState['history'][number]>()
          for(const sample of state.history)if(Date.parse(sample.at)>=Date.now()-90*86400000)daily.set(`${sample.id}/${sample.at.slice(0,10)}`,sample)
          state.history=[...daily.values()].slice(-20000)
          state.sources[kind]={lastSuccess:at,nextAttempt:new Date(Date.now()+15*60000).toISOString(),complete:true,error:null}
          await storage.put(key,state,entry.version);break
        }
        stage=staged;state.sources[kind]={lastSuccess:prior?.lastSuccess??null,nextAttempt:at,complete:false,error:'Inventory scan is incomplete; previous completed stock remains visible.',stage}
        entry.version=(await storage.put(key,state,entry.version)).version
        pages++;await new Promise(resolve=>setTimeout(resolve,550))
      }while(pages<20&&Date.now()<stop-1000)
    }catch(cause){
      const latest=await storage.get<InventoryState>(key);if(latest.version!==entry.version)continue
      state.sources[kind]={lastSuccess:prior?.lastSuccess??null,nextAttempt:new Date(Date.now()+Math.max(60,Number((cause as {retryAfter?:number}).retryAfter)||60)*1000).toISOString(),complete:false,error:cause instanceof Error?cause.message:'Inventory update failed. Saved stock is retained.'}
      await storage.put(key,state,latest.version)
    }
  }
  return updateStockAlerts(account,source,storage)
}
