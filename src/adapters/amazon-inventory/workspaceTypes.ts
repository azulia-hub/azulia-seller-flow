import type { CanonicalInventoryItem, ReplenishmentConfig, StockQuantities } from '../../core/inventory/types'
import type { InventorySource } from './reader'
export interface InventoryState {
  schema:1; account:string; items:CanonicalInventoryItem[]
  sources:Partial<Record<InventorySource,{lastSuccess:string|null;nextAttempt:string;error:string|null;complete:boolean;stage?:{started:string;nextToken:string;items:CanonicalInventoryItem[];raw:Record<string,unknown>[]}}>>
  history:{at:string;id:string;quantities:StockQuantities}[]
  raw:Partial<Record<InventorySource,Record<string,unknown>[]>>
}
export interface InventorySettings {
  schema:1; sellerId?:string; windowDays:7|30|90; notifyLowStock:boolean
  overrides:Record<string,{config?:Partial<ReplenishmentConfig>;physical?:number|null;countedAt?:string}>
}
export const initialInventorySettings=():InventorySettings=>({schema:1,windowDays:30,notifyLowStock:true,overrides:{}})
export const initialInventoryState=(account:string):InventoryState=>({schema:1,account,items:[],sources:{},history:[],raw:{}})
export interface InventoryStorage {
  get<T>(key:string):Promise<{version:number;value:T|null}>
  put(key:string,value:unknown,version?:number):Promise<{version:number}>
}
