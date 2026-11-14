export interface ReviewOrder {
  id:string; purchased:string; status:string|null
  replacement:boolean|null; replaces:string|null; earliestDelivery:string|null; latestDelivery:string|null
  verifiedAt:string|null
}
export type ReviewState='waiting'|'eligible'|'sending'|'sent'|'uncertain'|'expired'
export interface ReviewRecord {
  orderId:string; state:ReviewState; reason:string; nextCheck:string|null; checkedAt:string|null
  sentAt?:string; source?:'manual'|'automatic'|'seller-central-confirmed'; attemptId?:string; attemptAt?:string
}
export interface ReviewWorkspace {schema:1;account:string;records:Record<string,ReviewRecord>;links:Record<string,string>;blocked:Record<string,true>;verified:Record<string,ReviewOrder>}
export interface ReviewSettings {schema:1;autoEnabled:boolean;enabledAt:string|null}
export const initialReviews=(account:string):ReviewWorkspace=>({schema:1,account,records:{},links:{},blocked:{},verified:{}})
export const initialReviewSettings=():ReviewSettings=>({schema:1,autoEnabled:false,enabledAt:null})
