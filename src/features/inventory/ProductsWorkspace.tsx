import { useState,type ReactNode } from 'react'
import type { CanonicalOrder } from '../../core/data/types'
import type { SyncRange } from '../../core/sync/ranges'
import { InventoryWorkspace } from './InventoryWorkspace'
const emptyOrders:readonly CanonicalOrder[]=[]
const emptyCoverage:readonly SyncRange[]=[]
export function ProductsWorkspace({children,account,orders,coverage,today,productTitles,productImages,onRefresh,refreshing,initialInventory=false,initialSku}:{initialInventory?:boolean;initialSku?:string;children:ReactNode;account:string|null;orders?:readonly CanonicalOrder[];coverage?:readonly SyncRange[];today:string;productTitles:Readonly<Record<string,string>>;productImages:Readonly<Record<string,string>>;onRefresh:()=>Promise<void>;refreshing:boolean}){
  const [tab,setTab]=useState<'performance'|'inventory'>(initialInventory?'inventory':'performance')
  return <div><nav className="product-section-nav" aria-label="Product workspace"><button className="secondary" aria-pressed={tab==='performance'} onClick={()=>setTab('performance')}>Performance</button><button className="secondary" aria-pressed={tab==='inventory'} onClick={()=>setTab('inventory')}>Inventory & restock</button></nav>{tab==='performance'?children:<InventoryWorkspace initialSku={initialSku} key={account??'none'} account={account} orders={orders??emptyOrders} coverage={coverage??emptyCoverage} today={today} productTitles={productTitles} productImages={productImages} onRefresh={onRefresh} refreshing={refreshing}/>}</div>
}
