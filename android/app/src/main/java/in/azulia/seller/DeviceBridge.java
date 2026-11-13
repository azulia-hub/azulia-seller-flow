package in.azulia.seller;

import android.app.Activity;
import androidx.webkit.JavaScriptReplyProxy;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** One-way capabilities: no arbitrary URLs, filesystem paths, SQL, or secret-reading method. */
final class DeviceBridge {
    static final int VERSION=7;
    private final Activity activity;
    private final android.content.Context context;
    private final HeadlessSync.Listener engine;
    private final android.os.Handler main=new android.os.Handler(android.os.Looper.getMainLooper());
    private final DeviceDatabase database;
    private final AmazonSession session;
    private final ProductImages images;
    private final ExecutorService storage=Executors.newSingleThreadExecutor(), network=Executors.newFixedThreadPool(2), media=Executors.newFixedThreadPool(2);
    private volatile boolean closed;
    private final java.util.concurrent.atomic.AtomicBoolean imageQueued=new java.util.concurrent.atomic.AtomicBoolean();
    DeviceBridge(Activity activity,ProductImages images) {this(activity,images,null);}
    DeviceBridge(android.content.Context context,ProductImages images,HeadlessSync.Listener engine) {
        this.context=context;this.activity=context instanceof Activity?(Activity)context:null;this.engine=engine;this.images=images;
        database=new DeviceDatabase(context);session=new AmazonSession(context);
    }
    void receive(String message,JavaScriptReplyProxy reply) {
        if (closed || message==null || message.length()>64*1024*1024) return;
        try {
            JSONObject request=new JSONObject(message); String id=request.getString("id"),action=request.getString("action");
            if (!id.matches("[a-fA-F0-9-]{36}")) return;
            if (request.getInt("version")!=VERSION) { respond(reply,new JSONObject().put("id",id).put("status",409).put("error","Update the Android app before using this website.")); return; }
            JSONObject payload=request.optJSONObject("payload"); if (payload==null) payload=new JSONObject(); final JSONObject input=payload;
            if (action.equals("session.cancel")) session.cancel();
            ExecutorService executor=action.equals("image.get")?media:action.equals("amazon.request") || action.equals("session.connect")?network:storage;
            executor.execute(() -> {
                JSONObject result=new JSONObject();
                try { result.put("id",id).put("result",execute(action,input)); }
                catch (Exception cause) {
                    try {
                        int status=cause instanceof DeviceDatabase.Conflict?409:cause instanceof AmazonSession.ApiError?((AmazonSession.ApiError)cause).status:0;
                        String error=cause instanceof DeviceDatabase.Conflict || cause instanceof AmazonSession.ApiError?cause.getMessage():"Phone operation failed. Saved data is retained; check connection and storage.";
                        result.put("id",id).put("error",error).put("status",status).put("retryAfter",cause instanceof AmazonSession.ApiError?((AmazonSession.ApiError)cause).retryAfter:60);
                    } catch (Exception ignored) { return; }
                }
                respond(reply,result);
            });
        } catch (Exception ignored) { /* Malformed messages never access capabilities or leak raw exceptions. */ }
    }
    private Object execute(String action,JSONObject input) throws Exception {
        if(engine!=null && !(action.startsWith("source.")||action.startsWith("workspace.")||action.startsWith("engine.")||action.equals("reading.status")||action.equals("session.status")||action.equals("amazon.request")||action.equals("inventory.notify")||action.startsWith("background.")))throw new IllegalArgumentException("Unsupported background capability.");
        switch (action) {
            case "session.status": {
                JSONObject status=session.status(); if (status.optBoolean("configured")) BackgroundSync.schedule(context);
                if (!status.isNull("account")) status.put("backgroundStatus",database.retained("background-status:"+status.getString("account")));
                return status;
            }
            case "session.connect": { if(HeadlessSync.busy())throw new IllegalStateException("Wait for the current account sync to finish."); JSONObject status=session.connect(input); BackgroundSync.schedule(context);main.post(()->LiveSync.resume((MainActivity)activity)); return status; }
            case "session.forget": LiveSync.configure((MainActivity)activity,false); BackgroundSync.cancel(context); return session.forget();
            case "session.cancel": return new JSONObject().put("cancelled",true);
            case "ui.theme": ((MainActivity)activity).applySystemTheme(input.optBoolean("dark")); return true;
            case "live.status": case "sync.status": return LiveSync.status(context);
            case "sync.details": {JSONObject safe=LiveSync.validateIntent(input);main.post(()->{HeadlessSync.prioritize(safe);if(!HeadlessSync.busy()&&safe.optJSONArray("orderIds")!=null&&safe.optJSONArray("orderIds").length()>0)LiveSync.request((MainActivity)activity,safe);});return true;}
            case "sync.request": main.post(()->LiveSync.request((MainActivity)activity,input));return LiveSync.status(context);
            case "reading.status": return database.readingStatus(input.getString("account"));
            case "engine.ready": if(engine!=null){database.discardUploadStaging();engine.ready();}return true;
            case "engine.phase": if(engine!=null)engine.phase(input);return true;
            case "engine.completed": if(engine!=null)engine.complete(input);return true;
            case "live.configure": activity.runOnUiThread(() -> LiveSync.configure((MainActivity)activity,input.optBoolean("enabled"))); return LiveSync.status(activity);
            case "amazon.request": {
                String url=input.getString("url");
                if(engine!=null&&!LiveSync.networkAllowed(context))throw new AmazonSession.ApiError(0,"Waiting for an allowed internet connection; saved checkpoints are retained.",60);
                JSONObject response=session.request(url);
                String account=session.status().optString("account");
                OrderAlerts.observe(context,database,account,url,response);
                if(!closed&&imageQueued.compareAndSet(false,true))media.execute(()->{try(DeviceDatabase alerts=new DeviceDatabase(context)){OrderAlerts.images(context,alerts,account);}catch(Exception ignored){}finally{imageQueued.set(false);}});
                return response;
            }
            case "inventory.notify": InventoryAlerts.show(context,input);return new JSONObject().put("saved",true);
            case "workspace.head": return database.workspaceHead(input.getString("key"));
            case "workspace.get": return database.workspaceGet(input.getString("key"));
            case "workspace.put": { Object result=database.workspacePut(input);if("settings".equals(input.optString("key")))LiveSync.applySettings(context,input.getJSONObject("value"));return result; }
            case "workspace.chunk": return database.workspaceChunk(input);
            case "workspace.upload": return database.workspaceUpload(input);
            case "source.begin": return database.begin(input);
            case "source.commit": return database.commit(input);
            case "source.count": return database.count(input.getString("account"));
            case "source.list": return database.list(input);
            case "background.pending": return database.pendingBackground(input.getString("account"));
            case "background.read": return database.backgroundRead(input.getString("account"),input.getString("id"),input.getString("url"));
            case "image.get": return images.download(input.getString("url"));
            default: throw new IllegalArgumentException("Unsupported bridge operation.");
        }
    }
    private void respond(JavaScriptReplyProxy reply,JSONObject result) {
        String message=result.toString(); main.post(() -> { if (!closed && (activity==null || !activity.isFinishing())) { try { reply.postMessage(message); } catch (Exception ignored) { /* The old document may have closed. */ } } });
    }
    void backgrounded() { LiveSync.kick(); }
    void documentChanged() {
        // A replaced WebView document cannot keep a renewable JS writer lease alive.
        session.cancel();
        // Unified engine owns its own lease; a UI document must never revoke it.
    }
    void close() { closed=true; session.cancel(); network.shutdownNow(); media.shutdown(); storage.execute(database::close); storage.shutdown(); }
}
