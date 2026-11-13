package in.azulia.seller;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.util.Arrays;
import java.util.HashSet;

public final class MainActivity extends Activity {
    private static final String REMOTE="https://azulia-hub.github.io/azulia-seller-flow/";
    private final java.util.concurrent.ExecutorService startup=java.util.concurrent.Executors.newSingleThreadExecutor();
    private static final String BUNDLED="https://appassets.androidplatform.net/assets/web/index.html";
    private FrameLayout root;
    private WebView web;
    private ImageView logo;
    private DeviceBridge bridge;
    private ToolDownloads toolDownloads;
    private ValueCallback<Uri[]> files;
    private boolean bundled;
    private static boolean trusted(Uri uri) {
        if (!"https".equals(uri.getScheme()) || uri.getPort()!=-1 || uri.getUserInfo()!=null) return false;
        return ("azulia-hub.github.io".equals(uri.getHost()) && uri.getPath()!=null && uri.getPath().startsWith("/azulia-seller-flow/")) || ("appassets.androidplatform.net".equals(uri.getHost()) && uri.getPath()!=null && uri.getPath().startsWith("/assets/web/"));
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) { unavailable("Update Android System WebView to use Azulia."); return; }
        FrameLayout layout=new FrameLayout(this); root=layout;
        applySystemTheme(getPreferences(MODE_PRIVATE).getBoolean("dark",false));
        web=new WebView(this); layout.addView(web,new FrameLayout.LayoutParams(-1,-1));
        logo=new ImageView(this); logo.setImageResource(R.drawable.app_icon); logo.setScaleType(ImageView.ScaleType.CENTER_INSIDE); logo.setBackgroundColor(android.graphics.Color.rgb(248,246,239));
        layout.addView(logo,new FrameLayout.LayoutParams(-1,-1));
        if (Build.VERSION.SDK_INT>=30) layout.setOnApplyWindowInsetsListener((view,insets) -> {
            android.graphics.Insets padding=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.ime());
            view.setPadding(padding.left,padding.top,padding.right,padding.bottom); return insets;
        });
        else layout.setFitsSystemWindows(true);
        setContentView(layout); layout.requestApplyInsets();
        if (Build.VERSION.SDK_INT>=33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,() -> { if (web.canGoBack()) web.goBack(); else finish(); });
        WebSettings settings=web.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true); settings.setAllowFileAccess(false); settings.setAllowContentAccess(false); settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW); settings.setCacheMode(WebSettings.LOAD_NO_CACHE); settings.setJavaScriptCanOpenWindowsAutomatically(false); settings.setSupportMultipleWindows(false); settings.setMediaPlaybackRequiresUserGesture(true);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        ProductImages images=new ProductImages(this); bridge=new DeviceBridge(this,images);
        WebViewAssetLoader assets=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).addPathHandler("/images/",images::serve).build();
        WebViewCompat.addWebMessageListener(web,"AzuliaDevice",new HashSet<>(Arrays.asList("https://azulia-hub.github.io","https://appassets.androidplatform.net")),(view,message,origin,isMainFrame,reply) -> {
            // GitHub origins contain other repositories: require the application path as well.
            Uri current=Uri.parse(view.getUrl()==null?"":view.getUrl());
            if (!isMainFrame || !trusted(current) || origin.getHost()==null || !origin.getHost().equals(current.getHost()) || message.getType()!=androidx.webkit.WebMessageCompat.TYPE_STRING) return;
            bridge.receive(message.getData(),reply);
        });
        toolDownloads=new ToolDownloads(this,web,MainActivity::trusted);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean onRenderProcessGone(WebView view,android.webkit.RenderProcessGoneDetail detail) {
                // A lost Chromium renderer must not take down the native sync service.
                long now=System.currentTimeMillis(),last=getPreferences(MODE_PRIVATE).getLong("renderer-restart",0);
                getPreferences(MODE_PRIVATE).edit().putLong("renderer-restart",now).apply();
                if(toolDownloads!=null)toolDownloads.documentChanged();
                if(bridge!=null) { bridge.documentChanged(); bridge.close(); bridge=null; }
                if(root!=null)root.removeView(view); view.destroy(); web=null;
                if(now-last>5*60000L)recreate();
                else unavailable("Android closed the web renderer again. Saved data is safe. Close and reopen Azulia; connect debugging if this repeats.");
                return true;
            }
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon) { bridge.documentChanged(); if(toolDownloads!=null)toolDownloads.documentChanged(); }
            @Override public void onPageCommitVisible(WebView view,String url) { if(logo!=null){logo.setVisibility(android.view.View.GONE);} }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request) {
                Uri uri=request.getUrl();
                if (!request.isForMainFrame()) return !trusted(uri);
                if (trusted(uri)) return false;
                if ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) { try { startActivity(new Intent(Intent.ACTION_VIEW,uri)); } catch (Exception ignored) {} }
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request) {
                Uri uri=request.getUrl();
                // Also block subframes/resources from other repositories on the trusted GitHub origin.
                if ("azulia-hub.github.io".equals(uri.getHost()) && !trusted(uri)) return blocked();
                if ("appassets.androidplatform.net".equals(uri.getHost())) { WebResourceResponse response=assets.shouldInterceptRequest(uri); return response==null?blocked():response; }
                return null;
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error) { if (request.isForMainFrame()) { if (!bundled) openBundled(); else unavailable("The bundled interface is unavailable. Rebuild the APK with the web assets included."); } }
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,WebResourceResponse error) { if (request.isForMainFrame() && !bundled) openBundled(); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params) {
                if (!trusted(Uri.parse(view.getUrl()==null?"":view.getUrl()))) return false;
                if (files!=null) files.onReceiveValue(null); files=callback;
                Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*"); intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,params.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE);
                try { startActivityForResult(intent,40); return true; } catch (Exception ignored) { files=null; callback.onReceiveValue(null); return true; }
            }
        });
        chooseWebsite();
    }
    void applySystemTheme(boolean dark) {
        runOnUiThread(() -> {
            getPreferences(MODE_PRIVATE).edit().putBoolean("dark",dark).apply();
            int color=android.graphics.Color.parseColor(dark?"#191816":"#f7f5ef");
            if(root!=null)root.setBackgroundColor(color);
            getWindow().getDecorView().setBackgroundColor(color);
            getWindow().setStatusBarColor(color); getWindow().setNavigationBarColor(color);
            if(Build.VERSION.SDK_INT>=29)getWindow().setNavigationBarContrastEnforced(false);
            if(Build.VERSION.SDK_INT>=30) {
                android.view.WindowInsetsController controller=getWindow().getInsetsController();
                if(controller!=null)controller.setSystemBarsAppearance(dark?0:24,24);
            } else getWindow().getDecorView().setSystemUiVisibility(dark?0:android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        });
    }
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] grants) {
        super.onRequestPermissionsResult(code,permissions,grants);
        if(code==71 && grants.length>0 && grants[0]==android.content.pm.PackageManager.PERMISSION_GRANTED) LiveSync.configure(this,true);
    }
    private static WebResourceResponse blocked() { return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",java.util.Collections.emptyMap(),new java.io.ByteArrayInputStream(new byte[0])); }
    private void chooseWebsite() {
        startup.execute(() -> {
            boolean compatible=false;
            try {
                javax.net.ssl.HttpsURLConnection connection=AmazonSession.open(REMOTE+"device-bridge.json");
                connection.setConnectTimeout(1500); connection.setReadTimeout(1500); connection.setRequestProperty("Cache-Control","no-cache");
                try { if(connection.getResponseCode()==200){org.json.JSONObject manifest=new org.json.JSONObject(AmazonSession.read(connection.getInputStream(),4096));compatible=manifest.getInt("schema")==1 && manifest.getInt("minimumBridge")<=DeviceBridge.VERSION && manifest.getInt("maximumBridge")>=DeviceBridge.VERSION;} } finally {connection.disconnect();}
            } catch(Exception ignored) { /* Offline/older website: packaged UI remains available. */ }
            final boolean remote=compatible;
            runOnUiThread(() -> {if(!isFinishing()&&!isDestroyed()){if(remote){bundled=false;web.loadUrl(REMOTE);}else openBundled();}});
        });
    }
    private void openBundled() { bundled=true; if (web!=null) web.loadUrl(BUNDLED); }
    private void unavailable(String message) { TextView text=new TextView(this); text.setText(message); text.setPadding(32,64,32,32); setContentView(text); }
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data) {
        super.onActivityResult(requestCode,resultCode,data);
        if(toolDownloads!=null&&toolDownloads.result(requestCode,resultCode,data))return;
        if (requestCode==40 && files!=null) { ValueCallback<Uri[]> callback=files; files=null; callback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode,data)); }
    }
    @Override public void onBackPressed() { if (web!=null && web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override protected void onStart() { super.onStart(); BackgroundSync.foreground=true; LiveSync.resume(this); }
    @Override protected void onStop() { BackgroundSync.foreground=false; if(bridge!=null)bridge.backgrounded(); LiveSync.kick(); super.onStop(); }
    @Override protected void onDestroy() { if(toolDownloads!=null)toolDownloads.close(); if (files!=null) files.onReceiveValue(null); if (bridge!=null) bridge.close(); startup.shutdownNow(); if (web!=null) { web.stopLoading(); web.destroy(); } super.onDestroy(); }
}
