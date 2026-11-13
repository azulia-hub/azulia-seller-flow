package in.azulia.seller;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.Set;

/** Local persisted transition alerts. No API calls or image downloads on this path. */
final class InventoryAlerts {
    static void show(Context context,JSONObject input) throws Exception {
        String account=input.getString("account");if(!account.matches("[a-f0-9]{64}"))throw new IllegalArgumentException("Invalid account.");
        if(Build.VERSION.SDK_INT>=33&&context.checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=android.content.pm.PackageManager.PERMISSION_GRANTED)return;
        NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);if(manager==null)return;
        android.content.SharedPreferences preferences=context.getSharedPreferences("inventory-alerts",Context.MODE_PRIVATE);
        Set<String> sent=new HashSet<>(preferences.getStringSet(account,new HashSet<>()));
        manager.createNotificationChannel(new NotificationChannel("inventory-stock","Inventory & restock",NotificationManager.IMPORTANCE_DEFAULT));
        JSONArray alerts=input.optJSONArray("alerts");if(alerts==null)return;
        for(int i=0;i<Math.min(10,alerts.length());i++){
            JSONObject alert=alerts.getJSONObject(i);String id=alert.getString("id"),status=alert.getString("status");
            if(id.length()>64||sent.contains(id)||!status.matches("OUT_OF_STOCK|CRITICAL_REORDER|REORDER_SOON"))continue;
            String title=alert.optString("title",alert.optString("sku","Product"));if(title.length()>180)title=title.substring(0,180);
            String text=status.replace('_',' ').toLowerCase()+" · Suggested reorder: "+(alert.isNull("quantity")?"unavailable":alert.optInt("quantity"));
            android.content.Intent intent=new android.content.Intent(context,MainActivity.class).addFlags(android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP);
            android.app.PendingIntent tap=android.app.PendingIntent.getActivity(context,account.hashCode(),intent,android.app.PendingIntent.FLAG_UPDATE_CURRENT|android.app.PendingIntent.FLAG_IMMUTABLE);
            Notification notification=new Notification.Builder(context,"inventory-stock").setSmallIcon(R.drawable.ic_notification).setContentTitle(title).setContentText(text).setStyle(new Notification.BigTextStyle().bigText(text)).setContentIntent(tap).setAutoCancel(true).build();
            manager.notify((account+alert.optString("itemId")).hashCode(),notification);sent.add(id);
        }
        // The TypeScript event list is bounded to 100; retain only IDs still in its latest delivery.
        if(sent.size()>100){Set<String> latest=new HashSet<>();for(int i=0;i<alerts.length();i++){String id=alerts.getJSONObject(i).optString("id");if(sent.contains(id))latest.add(id);}sent=latest;}
        preferences.edit().putStringSet(account,sent).apply();
    }
}
