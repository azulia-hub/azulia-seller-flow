package in.azulia.seller;

import android.app.*;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import org.json.JSONObject;

/** One persisted summary per accepted manual request or daily sending batch. */
final class ReviewAlerts {
    static boolean show(Context context,JSONObject input) throws Exception {
        String account=input.getString("account"),id=input.getString("id");int count=input.getInt("count");
        if(!account.matches("[a-f0-9]{64}")||id.length()>160||!id.matches("[a-zA-Z0-9:.+-]+")||count<1||count>100000)throw new IllegalArgumentException("Invalid review summary.");
        android.content.SharedPreferences prefs=context.getSharedPreferences("review-alerts",Context.MODE_PRIVATE);
        String key=account+":"+id;
        if(prefs.getBoolean(key,false))return true;
        if(Build.VERSION.SDK_INT>=33&&context.checkSelfPermission("android.permission.POST_NOTIFICATIONS")!=android.content.pm.PackageManager.PERMISSION_GRANTED)return false;
        NotificationManager manager=context.getSystemService(NotificationManager.class);
        if(manager==null||!manager.areNotificationsEnabled())return false;
        manager.createNotificationChannel(new NotificationChannel("review-requests","Review requests sent",NotificationManager.IMPORTANCE_DEFAULT));
        if(manager.getNotificationChannel("review-requests").getImportance()==NotificationManager.IMPORTANCE_NONE)return false;
        String text="Amazon accepted "+count+" review request"+(count==1?".":"s.");
        String date = id.startsWith("daily:") && id.length() >= 16 ? id.substring(6, 16) :
            java.time.ZonedDateTime.now(java.time.ZoneId.of("Asia/Kolkata")).toLocalDate().toString();
        PendingIntent tap;
        try {
            tap = NotificationNav.reviewRun(context, account, date);
        } catch (Exception e) {
            tap = PendingIntent.getActivity(context,account.hashCode(),new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        }
        manager.notify(("reviews:"+account).hashCode(),new Notification.Builder(context,"review-requests").setSmallIcon(R.drawable.ic_notification).setContentTitle("Review requests sent").setContentText(text).setStyle(new Notification.BigTextStyle().bigText(text)).setContentIntent(tap).setOnlyAlertOnce(true).setAutoCancel(true).build());
        // Bounded history; daily queues and manual order journals remain the authoritative send guards.
        if(prefs.getAll().size()>100)prefs.edit().clear().commit();
        return prefs.edit().putBoolean(key,true).commit();
    }
}
