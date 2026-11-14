import {reviewControl} from '../../core/review-requests/planner'
import {useReviews} from './ReviewContext'
export function ReviewOrderControl({orderId}:{orderId:string}){
  const reviews=useReviews();if(!reviews?.account)return null
  const view=reviewControl(reviews.state?.records[orderId],Boolean(reviews.state?.blocked[orderId]))
  return view.sendable?<button type="button" className="review-order-control review-send" disabled={Boolean(reviews.busy)} title={view.reason} onClick={event=>{event.stopPropagation();void reviews.act(orderId,true).catch(()=>{})}}>Send request</button>:<span className={`review-order-control ${view.label==='Request sent'?'review-sent':'review-waiting'}`} title={view.reason} aria-label={`${view.label}: ${view.reason}`}>{view.label==='Request sent'?'✓ ':''}{view.label}</span>
}
