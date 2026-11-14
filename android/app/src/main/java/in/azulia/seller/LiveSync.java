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
    private static final Object QUEUE_LOCK=new Object();
    private static final java.util.Map<String,Long> recentPending=new java.util.concurrent.ConcurrentHashMap<>();
    private final ScheduledExecutorService worker=Executors.newSingleThreadScheduledExecutor();
    private volatile JSONObject requested;
    private volatile boolean starting;
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
        return new JSONObject().put("enabled",p.getBoolean("enabled",true)).put("running",running).put("busy",HeadlessSync.busy()).put("phase",p.getString("phase","idle")).put("message",p.getString("message","Automatic sync starts after Amazon connection.")).put("error",p.getString("error","")).put("lastAttempt",p.getLong("lastAttempt",0)).put("ordersThrough",p.getString("ordersThrough","")).put("ordersCheckedAt",p.getString("ordersCheckedAt","")).put("lastSuccess",p.getLong("lastSuccess",0)).put("nextCheck",p.getLong("lastAttempt",0)+p.getInt("syncMinutes",3)*60000L).put("notifications",permission).put("lastExit",ProcessDiagnostics.lastExit(c));
    }
    static JSONObject merge(JSONObject old,JSONObject next){
        if(old==null)return next;
        try{
            JSONObject result=new JSONObject(next.toString());
            for(String key:new String[]{"from","to"})
                if(old.has(key)&&(!result.has(key)||(key.equals("from")?old.getString(key).compareTo(result.getString(key))<0:old.getString(key).compareTo(result.getString(key))>0)))
                    result.put(key,old.getString(key));
            result.put("force",old.optBoolean("force")||next.optBoolean("force"));

            org.json.JSONArray ids=new org.json.JSONArray();
            java.util.Set<String> seen=new java.util.HashSet<>();
            for(JSONObject input:new JSONObject[]{old,next}){
                org.json.JSONArray values=input.optJSONArray("requestIds");
                if(values!=null)
                    for(int i=0;i<values.length();i++)
                        if(seen.add(values.optString(i))&&ids.length()<20)
                            ids.put(values.optString(i));
            }
            result.put("requestIds",ids);
            result.put("requestedThrough",Math.max(old.optLong("requestedThrough"),next.optLong("requestedThrough")));

            org.json.JSONArray orderIds=new org.json.JSONArray();
            java.util.Set<String> seenOrders=new java.util.HashSet<>();
            for(JSONObject input:new JSONObject[]{old,next}){
                org.json.JSONArray values=input.optJSONArray("orderIds");
                if(values!=null)
                    for(int i=0;i<values.length();i++){
                        String id=values.optString(i);
                        if(id!=null&&!id.isEmpty()&&seenOrders.add(id)&&orderIds.length()<250)
                            orderIds.put(id);
                    }
            }
            result.put("orderIds",orderIds);

            return result;
        }catch(Exception ignored){return next;}
    }
    static void requestState(Context c,JSONObject intent,String state,String error){
        try{
            org.json.JSONArray ids=intent.optJSONArray("requestIds");
            if(ids==null)return;
            android.content.SharedPreferences.Editor edit=prefs(c).edit();
            for(java.util.Map.Entry<String,?> entry:prefs(c).getAll().entrySet())
                if(entry.getKey().startsWith("request:"))
                    try{
                        JSONObject receipt=new JSONObject(String.valueOf(entry.getValue()));
                        if(System.currentTimeMillis()-receipt.optLong("at")>86400000L)edit.remove(entry.getKey());
                    }catch(Exception ignored){}
            for(int i=0;i<ids.length();i++){
                String id=ids.getString(i);
                recentPending.remove(id);
                edit.putString("request:"+id,new JSONObject().put("state",state).put("error",error).put("at",System.currentTimeMillis()).toString());
            }
            edit.apply();
        }catch(Exception ignored){}
    }
    static JSONObject requestStatus(Context c,String id)throws Exception{
        if(!id.matches("[a-zA-Z0-9-]{1,64}"))throw new IllegalArgumentException("Invalid refresh ID.");
        String raw=prefs(c).getString("request:"+id,null);
        if(raw!=null)return new JSONObject(raw);
        if(recentPending.containsKey(id)&&System.currentTimeMillis()-recentPending.get(id)<15000L)
            return new JSONObject().put("state","queued");
        return new JSONObject().put("state","unknown").put("error","Refresh request receipt expired or not found.");
    }
    static void registerRequest(Context c,JSONObject input){
        JSONObject safe=validateIntent(input);
        org.json.JSONArray ids=safe.optJSONArray("requestIds");
        if(ids!=null)
            for(int i=0;i<ids.length();i++)
                recentPending.put(ids.optString(i),System.currentTimeMillis());
        requestState(c,safe,"queued","");
    }

    static void continueRequest(Context c,JSONObject intent){
        synchronized(QUEUE_LOCK){
            LiveSync service=instance;
            if(service!=null){
                service.requested=merge(service.requested,intent);
                prefs(c).edit().putString("requested",service.requested.toString()).apply();
                kick();
            } else {
                try{
                    String existing=prefs(c).getString("requested",null);
                    JSONObject merged=existing!=null?merge(new JSONObject(existing),intent):intent;
                    prefs(c).edit().putString("requested",merged.toString()).apply();
                }catch(Exception ignored){
                    prefs(c).edit().putString("requested",intent.toString()).apply();
                }
            }
        }
    }
    static void resume(MainActivity activity){request(activity,new JSONObject());}
    static void request(MainActivity activity,JSONObject intent){
        configure(activity,true);
        registerRequest(activity,intent);
        JSONObject safe=validateIntent(intent);
        try{
            if(!safe.has("from")){
                JSONObject previous=new JSONObject(prefs(activity).getString("lastIntent","{}"));
                if(previous.has("from")){safe.put("from",previous.getString("from")).put("to",previous.getString("to"));}
            }
            JSONObject persistent=new JSONObject(safe.toString());
            persistent.remove("force");
            persistent.remove("orderIds");
            persistent.remove("requestIds");
            persistent.remove("requestedThrough");
            prefs(activity).edit().putString("lastIntent",persistent.toString()).apply();
        }catch(Exception ignored){}
        synchronized(QUEUE_LOCK){
            LiveSync service=instance;
            if(service!=null){
                if(safe.has("requestIds")||!HeadlessSync.busy()||!HeadlessSync.sameRange(safe)){
                    service.requested=merge(service.requested,safe);
                    prefs(activity).edit().putString("requested",service.requested.toString()).apply();
                }
                kick();
            } else {
                try{
                    String existing=prefs(activity).getString("requested",null);
                    JSONObject merged=existing!=null?merge(new JSONObject(existing),safe):safe;
                    prefs(activity).edit().putString("requested",merged.toString()).apply();
                }catch(Exception ignored){
                    prefs(activity).edit().putString("requested",safe.toString()).apply();
                }
            }
        }
    }
    static JSONObject validateIntent(JSONObject value){JSONObject result=new JSONObject();try{
        for(String key:new String[]{"from","to"})if(value.optString(key).matches("[0-9]{4}-[0-9]{2}-[0-9]{2}"))result.put(key,value.getString(key));
        String id=value.optString("requestId");org.json.JSONArray requestIds=value.optJSONArray("requestIds");if(id.matches("[a-zA-Z0-9-]{1,64}"))requestIds=new org.json.JSONArray().put(id);if(requestIds!=null){org.json.JSONArray clean=new org.json.JSONArray();for(int i=0;i<Math.min(20,requestIds.length());i++)if(requestIds.optString(i).matches("[a-zA-Z0-9-]{1,64}"))clean.put(requestIds.optString(i));result.put("requestIds",clean);result.put("requestedThrough",value.optLong("requestedThrough",System.currentTimeMillis()-2*60000L));}
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
    static void coalesceRange(String key){
        synchronized(QUEUE_LOCK){
            LiveSync value=instance;if(value==null)return;JSONObject pending=value.requested;if(pending!=null&&!pending.has("requestIds")&&(pending.optString("from")+"/"+pending.optString("to")).equals(key)&&value.requested==pending){value.requested=null;prefs(value).edit().remove("requested").apply();}
        }
    }
    static void kick(){LiveSync service=instance;if(service!=null&&!service.worker.isShutdown())try{service.worker.execute(service::safeCheck);}catch(RejectedExecutionException ignored){}}
    static boolean networkAllowed(Context c){
        ConnectivityManager manager=c.getSystemService(ConnectivityManager.class);NetworkCapabilities caps=manager.getNetworkCapabilities(manager.getActiveNetwork());
        return caps!=null&&caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)&&(!prefs(c).getBoolean("wifiOnly",false)||caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI));
    }
    private void safeCheck(){try{check();}catch(Exception failure){starting=false;prefs(this).edit().putString("error","Automatic sync was interrupted. Saved data is retained; retrying.").apply();phase(this,"waiting","Automatic sync was interrupted; retrying without deleting saved data.");try{String raw=prefs(this).getString("runningIntent",null);if(raw!=null&&!HeadlessSync.busy())continueRequest(this,new JSONObject(raw));}catch(Exception ignored){}}}
    private void check(){
        if(!running||starting||HeadlessSync.busy())return;
        if(!networkAllowed(this)){phase(this,"waiting",prefs(this).getBoolean("wifiOnly",false)?"Waiting for Wi-Fi; sync resumes automatically.":"Waiting for internet; sync resumes automatically.");return;}
        long now=System.currentTimeMillis();if(requested==null&&now-prefs(this).getLong("lastAttempt",0)<prefs(this).getInt("syncMinutes",3)*60000L)return;
        JSONObject intent;
        synchronized(QUEUE_LOCK){
            intent=requested;requested=null;
            if(intent==null)try{intent=new JSONObject(prefs(this).getString("lastIntent","{}"));}catch(Exception ignored){intent=new JSONObject();}
            prefs(this).edit().remove("requested").putString("runningIntent",intent.toString()).putLong("lastAttempt",now).apply();starting=true;
        }
        requestState(this,intent,"running","");HeadlessSync.start(this,intent,()->{starting=false;kick();});
    }
    @Override public void onCreate(){super.onCreate();
        NotificationManager manager=getSystemService(NotificationManager.class);manager.createNotificationChannel(new NotificationChannel("live-sync","Automatic sync",NotificationManager.IMPORTANCE_LOW));
        PendingIntent stop=PendingIntent.getService(this,0,new Intent(this,LiveSync.class).setAction("STOP"),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        try{startForeground(7602,new Notification.Builder(this,"live-sync").setSmallIcon(R.drawable.ic_notification).setContentTitle("Azulia automatic sync").setContentText("Amazon data and calculations update automatically").setContentIntent(open).setOngoing(true).addAction(new Notification.Action.Builder(null,"Stop",stop).build()).build());}
        catch(RuntimeException unavailable){BackgroundSync.schedule(this);stopSelf();return;}
        running=true;instance=this;try(DeviceDatabase db=new DeviceDatabase(this)){Object settings=db.retained("settings");if(settings instanceof JSONObject)applySettings(this,(JSONObject)settings);}catch(Exception ignored){}
        synchronized(QUEUE_LOCK){
            try{String raw=prefs(this).getString("requested",prefs(this).getString("runningIntent",null));requested=raw==null?new JSONObject():new JSONObject(raw);prefs(this).edit().remove("requested").apply();}catch(Exception ignored){requested=new JSONObject();}
        }
        wake=getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"Azulia:automatic-sync");wake.acquire(6*60*60*1000L);
        worker.scheduleWithFixedDelay(this::safeCheck,0,15,TimeUnit.SECONDS);
    }
    @Override public int onStartCommand(Intent intent,int flags,int id){if(intent!=null&&"STOP".equals(intent.getAction())){prefs(this).edit().putBoolean("enabled",false).apply();BackgroundSync.cancel(this);stopSelf();}return running&&prefs(this).getBoolean("enabled",true)?START_STICKY:START_NOT_STICKY;}
    @Override public void onTimeout(int id,int type){phase(this,"waiting","Android ended the live session. Scheduled processing remains; reopening restores live sync.");stopSelf();}
    @Override public void onDestroy(){instance=null;running=false;worker.shutdownNow();HeadlessSync.stop();if(wake!=null&&wake.isHeld())wake.release();stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy();}
    @Override public IBinder onBind(Intent intent){return null;}
}
