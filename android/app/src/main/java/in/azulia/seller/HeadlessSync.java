package in.azulia.seller;

import android.content.Context;
import android.net.Uri;
import android.os.*;
import android.webkit.*;
import androidx.webkit.*;
import org.json.JSONObject;
import java.util.Collections;

/** One bundled JS pipeline. No Activity, remote page, credential fields, or Java money engine. */
final class HeadlessSync {
    interface Listener { void ready();void phase(JSONObject value);void complete(JSONObject value); }
    private static volatile HeadlessSync active;
    private volatile String rangeKey="";
    private static final Handler main=new Handler(Looper.getMainLooper());
    private final Context context;
    private final Runnable finished;
    private final JSONObject intent;
    private WebView web;
    private DeviceBridge bridge;
    private boolean closed,started;
    private final Runnable timeout=()->complete(error("Background work reached its time budget. Saved checkpoints will resume automatically."));
    static void prioritize(JSONObject request){main.post(()->{HeadlessSync value=active;if(value!=null&&value.started&&!value.closed){org.json.JSONArray ids=request.optJSONArray("orderIds");if(ids!=null)value.web.evaluateJavascript("window.AzuliaBackground.prioritize("+ids.toString()+")",null);}});}
    static boolean sameRange(JSONObject request) {HeadlessSync value=active;return value!=null&&value.rangeKey.equals(request.optString("from")+"/"+request.optString("to"));}
    static boolean busy() { return active!=null; }
    static void start(Context context,JSONObject intent,Runnable finished) {
        main.post(()->{
            if(active!=null) { LiveSync.continueRequest(context,intent);finished.run(); return; }
            active=new HeadlessSync(context.getApplicationContext(),intent,finished);
            try { active.open(); }catch(Exception failure){ active.complete(error("Background engine could not start. Saved data is retained; retrying automatically.")); }
        });
    }
    static void stop() {main.post(()->{if(active!=null)active.complete(error("Android paused processing. Saved checkpoints are retained."));});}
    private HeadlessSync(Context context,JSONObject intent,Runnable finished) {this.context=context;this.intent=intent;this.finished=finished;}
    private static JSONObject error(String value) {JSONObject result=new JSONObject();try{result.put("error",value);}catch(Exception ignored){}return result;}
    private static boolean trusted(Uri uri) {return "https".equals(uri.getScheme())&&"appassets.androidplatform.net".equals(uri.getHost())&&uri.getPort()==-1&&uri.getUserInfo()==null&&uri.getPath()!=null&&uri.getPath().startsWith("/assets/web/");}
    private void open() throws Exception {
        if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))throw new IllegalStateException();
        LiveSync.phase(context,"fetching","Starting automatic Amazon update…");
        web=new WebView(context);
        web.getSettings().setJavaScriptEnabled(true);web.getSettings().setDomStorageEnabled(true);web.getSettings().setAllowFileAccess(false);web.getSettings().setAllowContentAccess(false);web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);web.getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
        web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_BOUND,true);
        ProductImages images=new ProductImages(context);
        bridge=new DeviceBridge(context,images,new Listener(){
            public void ready(){main.post(()->{if(!closed&&!started){started=true;web.evaluateJavascript("window.AzuliaBackground.run("+intent.toString()+")",null);}});}
            public void phase(JSONObject value){if(value.has("from")&&value.has("to"))rangeKey=value.optString("from")+"/"+value.optString("to");LiveSync.coalesceRange(rangeKey);LiveSync.phase(context,value.optString("phase","fetching"),value.optString("message","Updating…"));}
            public void complete(JSONObject value){main.postDelayed(()->HeadlessSync.this.complete(value),100);}
        });
        WebViewAssetLoader loader=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(context)).build();
        WebViewCompat.addWebMessageListener(web,"AzuliaDevice",Collections.singleton("https://appassets.androidplatform.net"),(view,message,origin,isMainFrame,reply)->{
            if(!closed&&isMainFrame&&trusted(Uri.parse(view.getUrl()==null?"":view.getUrl()))&&"appassets.androidplatform.net".equals(origin.getHost())&&message.getType()==WebMessageCompat.TYPE_STRING)bridge.receive(message.getData(),reply);
        });
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !trusted(request.getUrl());}
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                if(trusted(request.getUrl())) {WebResourceResponse result=loader.shouldInterceptRequest(request.getUrl());if(result!=null)return result;}
                return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",Collections.emptyMap(),new java.io.ByteArrayInputStream(new byte[0]));
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError failure){if(request.isForMainFrame())complete(error("Bundled background engine could not load. Saved data is retained."));}
            @Override public boolean onRenderProcessGone(WebView view,RenderProcessGoneDetail detail){complete(error("Android reclaimed the calculation process. Saved checkpoints will resume."));return true;}
        });
        main.postDelayed(timeout,Math.max(90000,intent.optLong("budgetMs",65000)+90000));
        web.loadUrl("https://appassets.androidplatform.net/assets/web/background.html");
    }
    private void complete(JSONObject value) {
        if(closed)return;closed=true;main.removeCallbacks(timeout);
        String error=value.optString("error","");
        LiveSync.prefs(context).edit().putString("phase",error.isEmpty()?(value.optBoolean("ordersFresh",true)?"ready":"waiting"):"error").putString("error",error).putString("message",error.isEmpty()?value.optString("message","Amazon data and calculations are up to date."):error).putLong("lastCompleted",System.currentTimeMillis()).apply();
        if(!value.optString("ordersThrough").isEmpty())LiveSync.prefs(context).edit().putString("ordersThrough",value.optString("ordersThrough")).putString("ordersCheckedAt",value.optString("ordersCheckedAt")).apply();
        boolean ordersFresh=value.optBoolean("ordersFresh",true);
        LiveSync.requestState(context,intent,!error.isEmpty()?"error":ordersFresh?"complete":"queued",error);
        LiveSync.prefs(context).edit().remove("runningIntent").apply();
        if(error.isEmpty()&&!ordersFresh)LiveSync.continueRequest(context,intent);
        if(error.isEmpty()&&ordersFresh)LiveSync.prefs(context).edit().putLong("lastSuccess",System.currentTimeMillis()).apply();
        if(bridge!=null)bridge.close();if(web!=null){web.stopLoading();web.destroy();web=null;}
        if(active==this)active=null;
        finished.run();LiveSync.kick();
    }
}
