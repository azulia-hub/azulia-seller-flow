import { expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openSyncStore } from '../../server/local/sync/store'
import { createReportSync } from '../../server/local/sync/coordinator'
it('isolates an unsupported financial reference instead of imposing its six-hour retry on all purchase dates', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'azulia-date-retry-'))
  let sync: Awaited<ReturnType<typeof createReportSync>> | undefined
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-07T12:00:00Z'))
  try {
    const store = await openSyncStore(directory, 'fixture')
    const range = { from: '2026-10-01T00:00:00.000Z', to: '2026-12-01T00:00:00.000Z' }, id = '111-1234567-1234567'
    store.enqueue('history', range)
    const row = (transactionId: string, orderId: string, postedDate: string) => ({ transactionId, postedDate, transactionStatus: 'RELEASED', relatedIdentifiers: [{ relatedIdentifierName: 'ORDER_ID', relatedIdentifierValue: orderId }] })
    store.commit(store.jobs()[0], [row('invalid', 'not-an-order', '2026-11-06T00:00:00Z'), row('valid', id, '2026-11-05T00:00:00Z')], null)
    store.set('purchaseCoverage', JSON.stringify([range])); store.set('lastRecentOrdersRefresh',String(Date.now())); store.set('lastPurchaseRefresh', String(Date.now())); store.set('lastRefresh', String(Date.now())); store.close()
    const request = vi.fn<typeof fetch>(async input => {
      const url = String(input)
      if (url === 'https://api.amazon.com/auth/o2/token') return Response.json({ access_token: 'fixture-access', token_type: 'bearer', expires_in: 3600 })
      if (url.includes(`/orders/v0/orders/${id}`)) return Response.json({ payload: { AmazonOrderId: id, PurchaseDate: '2026-10-20T00:00:00Z' } })
      throw new Error('Unexpected endpoint in the isolated-date retry regression.')
    })
    sync = await createReportSync({ directory, connectionKey: 'fixture', credentials: { AMAZON_SP_CLIENT_ID: 'id', AMAZON_SP_CLIENT_SECRET: 'secret', AMAZON_SP_REFRESH_TOKEN: 'refresh' }, request })
    await vi.advanceTimersByTimeAsync(3100)
    expect(sync.snapshot().records.find(record => record.transactionId === 'valid')?.azuliaOrderPurchaseDate).toBe('2026-10-20T00:00:00.000Z')
    expect(sync.status().orderDatesError).toBeNull()
    expect(sync.status().orderDateIssues).toBe(1)
    expect(request.mock.calls.some(([input]) => String(input).includes(`/orders/v0/orders/${id}`))).toBe(true)
  } finally { vi.useRealTimers(); await sync?.close(); await rm(directory, { recursive: true, force: true }) }
})

it('prioritizes recently updated orders over queued historical purchase pages',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'azulia-recent-order-'))
 let sync:Awaited<ReturnType<typeof createReportSync>>|undefined
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-15T10:00:00Z'))
 try{
  const store=await openSyncStore(directory,'fixture')
  const id='408-7187698-9598707',purchased='2026-11-15T09:03:10Z'
  store.saveOrderDate(id,purchased,{id,purchased,status:'Pending',fulfillmentType:'MFN',orderValue:null,currency:null})
  store.enqueue('purchases',{from:'2026-08-01T00:00:00Z',to:'2026-09-01T00:00:00Z'})
  store.close()
  const pages:URL[]=[]
  const request=vi.fn<typeof fetch>(async input=>{
   const url=new URL(String(input))
   if(url.hostname==='api.amazon.com')return Response.json({access_token:'fixture-access',token_type:'bearer',expires_in:3600})
   if(url.pathname==='/orders/v0/orders'){
    pages.push(url)
    return Response.json({payload:{Orders:[{AmazonOrderId:id,PurchaseDate:purchased,OrderStatus:'Unshipped',FulfillmentChannel:'MFN',MarketplaceId:'A21TJRUUN4KGV'}]}})
   }
   if(url.pathname==='/finances/2024-06-19/transactions')return Response.json({payload:{transactions:[]}})
   throw new Error('Unexpected endpoint')
  })
  sync=await createReportSync({directory,connectionKey:'fixture',credentials:{AMAZON_SP_CLIENT_ID:'id',AMAZON_SP_CLIENT_SECRET:'secret',AMAZON_SP_REFRESH_TOKEN:'refresh'},request})
  await vi.advanceTimersByTimeAsync(100)
  expect(pages[0].searchParams.has('LastUpdatedAfter')).toBe(true)
  expect(pages[0].searchParams.has('CreatedAfter')).toBe(false)
  expect(sync.snapshot().orders?.find(order=>order.id===id)?.status).toBe('Unshipped')
  expect(sync.status().ordersCheckedAt).not.toBeNull()
  expect(sync.status().purchaseCoverage).toEqual([])
 }finally{await sync?.close();vi.useRealTimers();await rm(directory,{recursive:true,force:true})}
})
