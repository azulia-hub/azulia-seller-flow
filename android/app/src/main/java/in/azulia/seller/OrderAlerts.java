package in.azulia.seller;

import android.app.*;
import android.content.*;
import android.graphics.*;
import android.os.Build;
import org.json.*;
import java.time.Instant;

/** Notifications describe source observations only; they do not calculate financial metrics. */
final class OrderAlerts {
    static synchronized void observe(Context context,DeviceDatabase db,String account,String url,JSONObject response) {
        if(!LiveSync.prefs(context).getBoolean("enabled",false) || response.optInt("status")!=200 || account.isEmpty())return;
        try {
            long since=LiveSync.prefs(context).getLong("since:"+account,Long.MAX_VALUE);
            JSONObject payload=new JSONObject(response.getString("body")).optJSONObject("payload"); if(payload==null)return;
            JSONArray orders=payload.optJSONArray("Orders"),transactions=payload.optJSONArray("transactions");
            if(orders!=null)for(int i=0;i<orders.length();i++) {
                JSONObject order=orders.getJSONObject(i); String id=order.optString("AmazonOrderId");
                if(!valid(id))continue;
                String status=order.optString("OrderStatus"),channel=OrderNoticePolicy.fulfillment(order.optString("FulfillmentChannel"));
                String observation="order-notice-state:"+account+":"+id;
                Object old=db.retained(observation); String previous="";
                if(old instanceof JSONObject && ((JSONObject)old).optLong("since")==since)previous=((JSONObject)old).optString("status");
                else {
                    // Migrate an existing Pending alert without replaying historical orders.
                    Object legacy=db.retained("alert:"+account+":order:"+id);
                    if(legacy instanceof JSONObject && ((JSONObject)legacy).optString("label").contains("· Pending ·"))previous="Pending";
                }
                String event=OrderNoticePolicy.event(previous,status,date(order.optString("PurchaseDate"))>=since);
                if(!event.isEmpty() && LiveSync.prefs(context).getBoolean(event.equals("confirmed")?"notifyConfirmations":"notifyOrders",true))notify(context,db,account,"order:"+id+":"+status,id,
                    (event.equals("confirmed")?"Order confirmed":"New order")+" · "+status+" · "+channel,
                    status.startsWith("Pending")?0xffd49b28:0xff20976a);
                if(event.equals("confirmed")) {
                    NotificationManager manager=context.getSystemService(NotificationManager.class);
                    manager.cancel(account+":order:"+id,0);
                    manager.cancel(account+":order:"+id+":Pending",0);
                    manager.cancel(account+":order:"+id+":PendingAvailability",0);
                }
                db.retain(observation,new JSONObject().put("status",status).put("since",since));
            }
            if(transactions!=null && LiveSync.prefs(context).getBoolean("notifyRefunds",true))for(int i=0;i<transactions.length();i++) {
                JSONObject tx=transactions.getJSONObject(i);
                if(!"Refund".equalsIgnoreCase(tx.optString("transactionType")) || date(tx.optString("postedDate"))<since)continue;
                String id=""; JSONArray refs=tx.optJSONArray("relatedIdentifiers");
                if(refs!=null)for(int j=0;j<refs.length();j++) { JSONObject ref=refs.getJSONObject(j); if("ORDER_ID".equals(ref.optString("relatedIdentifierName")))id=ref.optString("relatedIdentifierValue"); }
                String transaction=tx.optString("transactionId");
                if(refs!=null)for(int j=0;j<refs.length();j++) {JSONObject ref=refs.getJSONObject(j);if("DEFERRED_TRANSACTION_ID".equals(ref.optString("relatedIdentifierName")))transaction=ref.optString("relatedIdentifierValue",transaction);}
                if(valid(id) && !transaction.isEmpty())notify(context,db,account,"refund:"+transaction,id,"Refund recorded · "+tx.optString("transactionStatus",""),0xffd56346);
            }
            // Metadata can arrive after the order. Refresh existing notices quietly with cached title/photo.
            Object saved=db.retained("alert-index:"+account);
            if(saved instanceof JSONArray) { JSONArray index=(JSONArray)saved; int cursor=LiveSync.prefs(context).getInt("alert-cursor:"+account,0);
            for(int turn=0;turn<Math.min(2,index.length());turn++) { int i=(cursor+turn)%index.length();
                String key=index.getString(i); Object value=db.retained("alert:"+account+":"+key);
                if(value instanceof JSONObject) { JSONObject n=(JSONObject)value; notify(context,db,account,key,n.getString("order"),n.getString("label"),n.getInt("color")); }
            } LiveSync.prefs(context).edit().putInt("alert-cursor:"+account,(cursor+2)%Math.max(1,index.length())).apply(); }
        } catch(Exception ignored) { /* Optional notifications cannot break ingestion or expose raw seller data. */ }
    }
    static void images(Context context,DeviceDatabase db,String account)throws Exception {
        Object raw=db.retained("alert-index:"+account);if(!(raw instanceof JSONArray))return;
        JSONArray index=(JSONArray)raw;
        for(int i=index.length()-1;i>=Math.max(0,index.length()-40);i--){
            Object value=db.retained("alert:"+account+":"+index.getString(i));if(!(value instanceof JSONObject))continue;
            JSONObject notice=(JSONObject)value;String image=text(notice,"image");
            if(image.isEmpty()||notice.optBoolean("hasImage"))continue;
            new ProductImages(context).download(image);
            notify(context,db,account,index.getString(i),notice.getString("order"),notice.getString("label"),notice.getInt("color"));return;
        }
    }
    private static long date(String value) {try{return Instant.parse(value).toEpochMilli();}catch(Exception e){return 0;}}
    private static boolean valid(String id) {return id.matches("[A-Z0-9]{3}-[0-9]{7}-[0-9]{7}");}
    private static String text(JSONObject object,String key) {String value=object.optString(key,"");return "null".equals(value)?"":value;}
    private static void notify(Context c,DeviceDatabase db,String account,String key,String id,String label,int color) throws Exception {
        if(Build.VERSION.SDK_INT>=33 && c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED)return;
        String title="Order "+id,image="";
        Object raw=db.retained("source:"+account+":orders:"+id);
        if(raw instanceof JSONObject) {
            JSONObject order=(JSONObject)raw;
            title=text(order,"title").isEmpty()?title:text(order,"title"); image=text(order,"imageUrl");
            JSONArray items=order.optJSONArray("items");
            if(items!=null && items.length()>0) {
                JSONObject item=items.getJSONObject(0); if(!text(item,"title").isEmpty())title=text(item,"title"); if(image.isEmpty())image=text(item,"imageUrl");
                Object cat=db.retained("source:"+account+":catalog:"+text(item,"asin"));
                if(cat instanceof JSONObject) { JSONObject catalog=(JSONObject)cat;if(!text(catalog,"title").isEmpty())title=text(catalog,"title"); if(image.isEmpty())image=text(catalog,"imageUrl"); }
            }
        }
        Object extra=db.retained("alert-meta:"+account+":"+id);
        if(extra instanceof JSONObject) {JSONObject metadata=(JSONObject)extra;if(!text(metadata,"title").isEmpty())title=text(metadata,"title");if(image.isEmpty())image=text(metadata,"imageUrl");}
        String storage="alert:"+account+":"+key;Object prior=db.retained(storage);
        JSONObject previous=prior instanceof JSONObject?(JSONObject)prior:null;
        Bitmap bitmap=null;if(!image.isEmpty())try{bitmap=new ProductImages(c).bitmapCached(image);}catch(Exception ignored){}
        if(previous!=null && (image.isEmpty()||previous.optBoolean("hasImage")||bitmap==null) && label.equals(previous.optString("label")) && title.equals(previous.optString("title")) && image.equals(previous.optString("image")))return;
        NotificationManager nm=c.getSystemService(NotificationManager.class);
        NotificationChannel channel=new NotificationChannel("seller-alerts","Orders & refunds",NotificationManager.IMPORTANCE_DEFAULT);
        channel.setSound(android.provider.Settings.System.DEFAULT_NOTIFICATION_URI,new android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION).build());nm.createNotificationChannel(channel);
        PendingIntent open=PendingIntent.getActivity(c,0,new Intent(c,MainActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        boolean sound=LiveSync.prefs(c).getBoolean("notificationSound",true);
        if(!sound){NotificationChannel quiet=new NotificationChannel("seller-alerts-quiet","Order and refund alerts (quiet)",NotificationManager.IMPORTANCE_LOW);quiet.setSound(null,null);nm.createNotificationChannel(quiet);}
        Notification.Builder notice=new Notification.Builder(c,sound?"seller-alerts":"seller-alerts-quiet").setSmallIcon(R.drawable.ic_notification).setContentTitle(label).setContentText(title)
            .setStyle(new Notification.BigTextStyle().bigText(title+"\n"+id)).setColor(color).setContentIntent(open).setAutoCancel(true).setOnlyAlertOnce(true);
        if(previous!=null) {
            boolean active=false;
            for(android.service.notification.StatusBarNotification entry:nm.getActiveNotifications())if((account+":"+key).equals(entry.getTag()))active=true;
            if(!active) { db.retain(storage,new JSONObject().put("order",id).put("label",label).put("title",title).put("image",image).put("hasImage",bitmap!=null).put("color",color)); return; }
        }
        if(bitmap!=null)notice.setLargeIcon(bitmap).setStyle(new Notification.BigPictureStyle().bigPicture(bitmap).setSummaryText(title));
        nm.notify(account+":"+key,0,notice.build());
        db.retain(storage,new JSONObject().put("order",id).put("label",label).put("title",title).put("image",image).put("hasImage",bitmap!=null).put("color",color));
        if(previous==null) { Object old=db.retained("alert-index:"+account);JSONArray index=old instanceof JSONArray?(JSONArray)old:new JSONArray();index.put(key);db.retain("alert-index:"+account,index); }
    }
}
