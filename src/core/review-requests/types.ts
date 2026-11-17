export interface ReviewOrder {
  id:string; purchased:string; status:string|null
  fulfillment?:'seller'|'marketplace'|'unknown'; paymentReleased?:boolean; deliveryConfirmed?:boolean
  replacement:boolean|null; replaces:string|null; earliestDelivery:string|null; latestDelivery:string|null
  verifiedAt:string|null
}
export type ReviewState='waiting'|'eligible'|'sending'|'sent'|'uncertain'|'expired'
export interface ReviewRecord {
  orderId:string; state:ReviewState; reason:string; nextCheck:string|null; checkedAt:string|null
  sentAt?:string; source?:'manual'|'automatic'|'seller-central-confirmed'; attemptId?:string; attemptAt?:string
  checkFailed?:boolean
}
export interface DailyReviewRun {date:string;time:string;startedAt:string;orderIds:string[];remaining:string[];notifiedCount?:number}
export interface ReviewWorkspace {schema:1;account:string;records:Record<string,ReviewRecord>;links:Record<string,string>;blocked:Record<string,true>;verified:Record<string,ReviewOrder>;dailyRun?:DailyReviewRun}
export interface ReviewSettings {schema:1;autoEnabled:boolean;enabledAt:string|null;dailyTime?:string}
export const initialReviews=(account:string):ReviewWorkspace=>({schema:1,account,records:{},links:{},blocked:{},verified:{}})
export const initialReviewSettings=():ReviewSettings=>({schema:1,autoEnabled:false,enabledAt:null,dailyTime:'14:53'})
