package in.azulia.seller;
import android.app.*;
import android.content.*;
import android.os.*;
import android.net.*;
import org.json.JSONObject;
import java.util.concurrent.*;

/** Native scheduling, one shared bundled JS fetch→merge→calculate→save pipeline. */
public final class LiveSync extends Service {
    static volatile boolean running;
    private static volatile LiveSync instance;
    private final ScheduledExecutorService worker=Executors.newSingleThreadScheduledExecutor();
    private volatile JSONObject requested;
    private PowerManager.WakeLock wake;
    static android.content.SharedPreferences prefs(Context c){return c.getSharedPreferences("live-sync",MODE_PRIVATE);}
    static void applySettings(Context c,JSONObject settings){
        JSONObject p=settings.optJSONObject("preferences");if(p==null)return;
        int minutes=p.optInt("syncMinutes",3);if(minutes<2||minutes>5)minutes=3;
        String period=p.optString("defaultPeriod","LAST_30_DAYS");if(!period.equals(prefs(c).getString("defaultPeriod","")))prefs(c).edit().remove("lastIntent").putString("defaultPeriod",period).apply();
        android.content.SharedPreferences.Editor edit=prefs(c).edit().putInt("syncMinutes",minutes).putBoolean("wifiOnly",p.optBoolean("wifiOnly",false));
        for(String key:new String[]{"notifyOrders","notifyConfirmations","notifyRefunds","notificationSound"})edit.putBoolean(key,p.optBoolean(key,true));edit.apply();
    }
    static void phase(Context c,String phase,String message){prefs(c).edit().putString("phase",phase).putString("message",message).putString("error","").apply();}
    static JSONObject status(Context c)throws Exception{
        android.content.SharedPreferences p=prefs(c);boolean permission=Build.VERSION.SDK_INT<33||c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)==android.content.pm.PackageManager.PERMISSION_GRANTED;
        return new JSONObject().put("enabled",p.getBoolean("enabled",true)).put("running",running).put("busy",HeadlessSync.busy()).put("phase",p.getString("phase","idle")).put("message",p.getString("message","Automatic sync starts after Amazon connection.")).put("error",p.getString("error","")).put("lastSuccess",p.getLong("lastSuccess",0)).put("nextCheck",p.getLong("lastAttempt",0)+p.getInt("syncMinutes",3)*60000L).put("notifications",permission).put("lastExit",ProcessDiagnostics.lastExit(c));
    }
    static void resume(MainActivity activity){request(activity,new JSONObject());}
    static void request(MainActivity activity,JSONObject intent){
        configure(activity,true);JSONObject safe=validateIntent(intent);
        try{if(!safe.has("from")){JSONObject previous=new JSONObject(prefs(activity).getString("lastIntent","{}"));if(previous.has("from")){safe.put("from",previous.getString("from")).put("to",previous.getString("to"));}}JSONObject persistent=new JSONObject(safe.toString());persistent.remove("force");persistent.remove("orderIds");prefs(activity).edit().putString("lastIntent",persistent.toString()).apply();}catch(Exception ignored){}
        LiveSync service=instance;if(service!=null){if(!HeadlessSync.busy()||!HeadlessSync.sameRange(safe))service.requested=safe;kick();}
        else prefs(activity).edit().putString("requested",validateIntent(intent).toString()).apply();
    }
    static JSONObject validateIntent(JSONObject value){JSONObject result=new JSONObject();try{
        for(String key:new String[]{"from","to"})if(value.optString(key).matches("[0-9]{4}-[0-9]{2}-[0-9]{2}"))result.put(key,value.getString(key));
        result.put("force",value.optBoolean("force"));org.json.JSONArray ids=value.optJSONArray("orderIds"),safe=new org.json.JSONArray();
        if(ids!=null)for(int i=0;i<Math.min(250,ids.length());i++)if(ids.optString(i).matches("[A-Z0-9]{3}-[0-9]{7}-[0-9]{7}"))safe.put(ids.getString(i));result.put("orderIds",safe);
    }catch(Exception ignored){}return result;}
    static void configure(MainActivity activity,boolean enabled){try{
        if(!enabled){prefs(activity).edit().putBoolean("enabled",false).apply();activity.stopService(new Intent(activity,LiveSync.class));return;}
        JSONObject session=new AmazonSession(activity).status();if(!session.optBoolean("configured"))return;
        String since="since:"+session.optString("account");if(!prefs(activity).contains(since))prefs(activity).edit().putLong(since,System.currentTimeMillis()).apply();
        if(Build.VERSION.SDK_INT>=33&&activity.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED&&!prefs(activity).getBoolean("permissionAsked",false)){
            prefs(activity).edit().putBoolean("permissionAsked",true).apply();activity.requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS},71);
        }
        prefs(activity).edit().putBoolean("enabled",true).apply();if(!running)activity.startForegroundService(new Intent(activity,LiveSync.class));
    }catch(Exception ignored){phase(activity,"waiting","Android delayed automatic syncing. Scheduled checks remain available.");}}
    static void coalesceRange(String key){LiveSync value=instance;if(value==null)return;JSONObject pending=value.requested;if(pending!=null&&(pending.optString("from")+"/"+pending.optString("to")).equals(key)&&value.requested==pending)value.requested=null;}
    static void kick(){LiveSync service=instance;if(service!=null&&!service.worker.isShutdown())try{service.worker.execute(service::check);}catch(RejectedExecutionException ignored){}}
    static boolean networkAllowed(Context c){
        ConnectivityManager manager=c.getSystemService(ConnectivityManager.class);NetworkCapabilities caps=manager.getNetworkCapabilities(manager.getActiveNetwork());
        return caps!=null&&caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)&&(!prefs(c).getBoolean("wifiOnly",false)||caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI));
    }
    private void check(){
        if(!running||HeadlessSync.busy())return;
        if(!networkAllowed(this)){phase(this,"waiting",prefs(this).getBoolean("wifiOnly",false)?"Waiting for Wi-Fi; sync resumes automatically.":"Waiting for internet; sync resumes automatically.");return;}
        long now=System.currentTimeMillis();if(requested==null&&now-prefs(this).getLong("lastAttempt",0)<prefs(this).getInt("syncMinutes",3)*60000L)return;
        JSONObject intent=requested;requested=null;if(intent==null)try{intent=new JSONObject(prefs(this).getString("lastIntent","{}"));}catch(Exception ignored){intent=new JSONObject();}
        prefs(this).edit().putLong("lastAttempt",now).apply();HeadlessSync.start(this,intent,()->{});
    }
    @Override public void onCreate(){super.onCreate();
        NotificationManager manager=getSystemService(NotificationManager.class);manager.createNotificationChannel(new NotificationChannel("live-sync","Automatic sync",NotificationManager.IMPORTANCE_LOW));
        PendingIntent stop=PendingIntent.getService(this,0,new Intent(this,LiveSync.class).setAction("STOP"),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        try{startForeground(7602,new Notification.Builder(this,"live-sync").setSmallIcon(R.drawable.ic_notification).setContentTitle("Azulia automatic sync").setContentText("Amazon data and calculations update automatically").setContentIntent(open).setOngoing(true).addAction(new Notification.Action.Builder(null,"Stop",stop).build()).build());}
        catch(RuntimeException unavailable){BackgroundSync.schedule(this);stopSelf();return;}
        running=true;instance=this;try(DeviceDatabase db=new DeviceDatabase(this)){Object settings=db.retained("settings");if(settings instanceof JSONObject)applySettings(this,(JSONObject)settings);}catch(Exception ignored){}
        try{String raw=prefs(this).getString("requested",null);requested=raw==null?new JSONObject():new JSONObject(raw);prefs(this).edit().remove("requested").apply();}catch(Exception ignored){requested=new JSONObject();}
        wake=getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"Azulia:automatic-sync");wake.acquire(6*60*60*1000L);
        worker.scheduleWithFixedDelay(this::check,0,15,TimeUnit.SECONDS);
    }
    @Override public int onStartCommand(Intent intent,int flags,int id){if(intent!=null&&"STOP".equals(intent.getAction())){prefs(this).edit().putBoolean("enabled",false).apply();BackgroundSync.cancel(this);stopSelf();}return running&&prefs(this).getBoolean("enabled",true)?START_STICKY:START_NOT_STICKY;}
    @Override public void onTimeout(int id,int type){phase(this,"waiting","Android ended the live session. Scheduled processing remains; reopening restores live sync.");stopSelf();}
    @Override public void onDestroy(){instance=null;running=false;worker.shutdownNow();HeadlessSync.stop();if(wake!=null&&wake.isHeld())wake.release();stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy();}
    @Override public IBinder onBind(Intent intent){return null;}
}
