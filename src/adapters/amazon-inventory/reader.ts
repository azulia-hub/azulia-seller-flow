import type { PilotCredentials } from '../amazon-api/authorization.ts'
import { SourceError, sourceAccessToken } from '../amazon-api/reader.ts'
export type InventorySource = 'fba' | 'listings'
export interface InventoryPageRequest { source: InventorySource; sellerId?: string; nextToken?: string | null }
/** Fixed read-only India endpoints. Credentials and arbitrary URLs never enter the UI. */
export function createInventoryReader(credentials: PilotCredentials, request: typeof fetch = fetch, sessionToken?: string) {
  let token = sessionToken ?? '', until = sessionToken ? Infinity : 0
  return async (job: InventoryPageRequest, signal: AbortSignal): Promise<Record<string,unknown>> => {
    if (!token || Date.now() >= until) { token = await sourceAccessToken(credentials, request); until = Date.now() + 45*60000 }
    if (job.nextToken && job.nextToken.length > 16000) throw new SourceError('Inventory continuation is invalid.',60,400)
    const url = new URL('https://sellingpartnerapi-eu.amazon.com')
    if (job.source === 'fba') {
      url.pathname = '/fba/inventory/v1/summaries'
      url.search = new URLSearchParams({ granularityType:'Marketplace', granularityId:'A21TJRUUN4KGV', marketplaceIds:'A21TJRUUN4KGV', details:'true', ...(job.nextToken ? {nextToken:job.nextToken} : {}) }).toString()
    } else {
      if (!job.sellerId || !/^[A-Z0-9]{8,32}$/.test(job.sellerId)) throw new SourceError('Seller ID is required to fetch listing availability.',3600,400)
      url.pathname = `/listings/2021-08-01/items/${job.sellerId}`
      url.search = new URLSearchParams({marketplaceIds:'A21TJRUUN4KGV',includedData:'summaries,fulfillmentAvailability',pageSize:'20',...(job.nextToken?{pageToken:job.nextToken}:{})}).toString()
    }
    const response=await request(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(10000)]),redirect:'error',headers:{'x-amz-access-token':token,'User-Agent':'Azulia/0.2'}})
    if(!response.ok){await response.body?.cancel();if(response.status===401){token='';until=0}throw new SourceError(response.status===403?'Inventory/listing access is not authorised. Financial sync is unaffected.':'Inventory could not be updated; saved stock is retained.',Math.max(response.status===403?3600:60,Number(response.headers.get('retry-after'))||60),response.status)}
    const stream=response.body?.getReader();if(!stream)throw new SourceError('Amazon returned no inventory data.')
    let size=0;const chunks:Uint8Array[]=[]
    try{while(true){const part=await stream.read();if(part.done)break;size+=part.value.length;if(size>6*1024*1024)throw new SourceError('Inventory page exceeds the supported size.');chunks.push(part.value)}}finally{await stream.cancel()}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
    const value:unknown=JSON.parse(new TextDecoder().decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw new SourceError('Unrecognized inventory page.')
    return value as Record<string,unknown>
  }
}
