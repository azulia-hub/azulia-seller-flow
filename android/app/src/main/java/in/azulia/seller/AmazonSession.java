package in.azulia.seller;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.concurrent.atomic.AtomicInteger;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.net.ssl.HttpsURLConnection;

final class AmazonSession {
    private static final String ALIAS="azulia-amazon-v1";
    private final SharedPreferences prefs;
    private final AtomicInteger epoch=new AtomicInteger();
    private String access=""; private long until;
    AmazonSession(Context context) { prefs=context.getSharedPreferences("amazon-vault",Context.MODE_PRIVATE); }
    private SecretKey key() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (store.containsAlias(ALIAS)) return ((KeyStore.SecretKeyEntry)store.getEntry(ALIAS,null)).getSecretKey();
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    private JSONObject decrypt() throws Exception {
        String encrypted=prefs.getString("encrypted",null); if (encrypted==null) return null;
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(prefs.getString("iv",""),Base64.NO_WRAP)));
        return new JSONObject(new String(cipher.doFinal(Base64.decode(encrypted,Base64.NO_WRAP)),StandardCharsets.UTF_8));
    }
    synchronized JSONObject status() throws Exception {
        JSONObject value=decrypt(); String account=prefs.getString("account",null);
        return new JSONObject().put("bridgeVersion",DeviceBridge.VERSION).put("account",account==null?JSONObject.NULL:account).put("configured",value!=null);
    }
    private static String credential(JSONObject body,String field,int max) throws Exception {
        String value=body.getString(field); if (value.isEmpty() || value.length()>max || value.matches("(?s).*[\\r\\n\\x00].*")) throw new IllegalArgumentException("Invalid credentials."); return value;
    }
    JSONObject connect(JSONObject input) throws Exception {
        int operation=epoch.incrementAndGet(); String account=input.getString("account"); DeviceDatabase.account(account);
        JSONObject credentials=new JSONObject().put("clientId",credential(input,"clientId",1024)).put("clientSecret",credential(input,"clientSecret",2048)).put("refreshToken",credential(input,"refreshToken",8192));
        String token=exchange(credentials);
        synchronized(this) {
            if (epoch.get()!=operation) throw new IllegalStateException("Connection cancelled.");
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE,key());
            String encrypted=Base64.encodeToString(cipher.doFinal(credentials.toString().getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);
            if (!prefs.edit().putString("account",account).putString("encrypted",encrypted).putString("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)).commit()) throw new IllegalStateException("Credential storage failed.");
            access=token; until=System.currentTimeMillis()+45*60000;
        }
        return status();
    }
    void cancel() { epoch.incrementAndGet(); }
    synchronized JSONObject forget() throws Exception {
        epoch.incrementAndGet(); access=""; until=0;
        if (!prefs.edit().remove("encrypted").remove("iv").commit()) throw new IllegalStateException("Credential removal failed.");
        return new JSONObject().put("forgotten",true);
    }
    private String exchange(JSONObject credentials) throws Exception {
        String form="grant_type=refresh_token&client_id="+encode(credentials.getString("clientId"))+"&client_secret="+encode(credentials.getString("clientSecret"))+"&refresh_token="+encode(credentials.getString("refreshToken"));
        HttpsURLConnection connection=open("https://api.amazon.com/auth/o2/token");
        try {
            connection.setRequestMethod("POST"); connection.setDoOutput(true); connection.setRequestProperty("Content-Type","application/x-www-form-urlencoded;charset=UTF-8");
            byte[] bytes=form.getBytes(StandardCharsets.UTF_8); connection.setFixedLengthStreamingMode(bytes.length);
            try (java.io.OutputStream output=connection.getOutputStream()) { output.write(bytes); }
            int status=connection.getResponseCode();
            if (status!=200) throw new ApiError(status,"Amazon authorization failed. Check credentials and seller approval.",retry(connection));
            JSONObject result=new JSONObject(read(connection.getInputStream(),1024*1024));
            String token=result.getString("access_token"); if (token.isEmpty() || token.length()>16384) throw new IllegalStateException("Invalid authorization response."); return token;
        } finally { connection.disconnect(); }
    }
    private synchronized String token() throws Exception {
        if (!access.isEmpty() && System.currentTimeMillis()<until) return access;
        JSONObject credentials=decrypt(); if (credentials==null) throw new ApiError(401,"Connect Amazon to continue.",60);
        access=exchange(credentials); until=System.currentTimeMillis()+45*60000; return access;
    }
    JSONObject request(String value) throws Exception { return request(value,"GET"); }
    JSONObject solicit(String orderId) throws Exception { if(!orderId.matches("[A-Z0-9]{3}-[0-9]{7}-[0-9]{7}"))throw new IllegalArgumentException("Invalid order.");return request("https://sellingpartnerapi-eu.amazon.com/solicitations/v1/orders/"+orderId+"/solicitations/productReviewAndSellerFeedback?marketplaceIds=A21TJRUUN4KGV","POST"); }
    private JSONObject request(String value,String method) throws Exception {
        URL url=new URL(value);
        if (!url.getProtocol().equals("https") || !url.getHost().equals("sellingpartnerapi-eu.amazon.com") || url.getPort()!=-1 || url.getUserInfo()!=null || url.getRef()!=null) throw new IllegalArgumentException("Unsupported Amazon host.");
        String path=url.getPath();
        boolean reviewGet=method.equals("GET")&&path.matches("/solicitations/v1/orders/[A-Z0-9]{3}-[0-9]{7}-[0-9]{7}");
        boolean reviewPost=method.equals("POST")&&path.matches("/solicitations/v1/orders/[A-Z0-9]{3}-[0-9]{7}-[0-9]{7}/solicitations/productReviewAndSellerFeedback");
        if (!reviewGet && !reviewPost && !path.equals("/fba/inventory/v1/summaries") && !path.matches("/listings/2021-08-01/items/[A-Z0-9]{8,32}") && !path.equals("/finances/2024-06-19/transactions") && !path.equals("/orders/v0/orders") && !path.matches("/orders/v0/orders/[A-Z0-9]{3}-[0-9]{7}-[0-9]{7}(/orderItems)?") && !path.matches("/catalog/2022-04-01/items/[A-Z0-9]{10}")) throw new IllegalArgumentException("Unsupported Amazon operation.");
        if (value.length()>24000) throw new IllegalArgumentException("Amazon request exceeds limit.");
        for (int attempt=0;attempt<(method.equals("POST")?1:2);attempt++) {
            HttpsURLConnection connection=open(value);connection.setRequestMethod(method);
            try {
                connection.setRequestProperty("x-amz-access-token",token()); connection.setRequestProperty("User-Agent","AzuliaAndroid/0.1");
                int status=connection.getResponseCode();
                if (status==401 && attempt==0) { synchronized(this) { access=""; until=0; } continue; }
                // Readers interpret status; upstream error bodies are deliberately not forwarded.
                String body=status>=200 && status<300?read(connection.getInputStream(),20*1024*1024):"{}";
                return new JSONObject().put("status",status).put("body",body).put("retryAfter",String.valueOf(retry(connection)));
            } finally { connection.disconnect(); }
        }
        throw new ApiError(401,"Reconnect Amazon to continue.",60);
    }
    static HttpsURLConnection open(String url) throws Exception {
        HttpsURLConnection connection=(HttpsURLConnection)new URL(url).openConnection(); connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(30000); connection.setUseCaches(false); return connection;
    }
    static String read(InputStream input,int maximum) throws Exception {
        try (InputStream stream=input; ByteArrayOutputStream output=new ByteArrayOutputStream()) {
            byte[] buffer=new byte[16384]; int read;
            while ((read=stream.read(buffer))!=-1) { if (output.size()+read>maximum) throw new IllegalArgumentException("Response exceeds size limit."); output.write(buffer,0,read); }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }
    private static String encode(String value) throws Exception { return URLEncoder.encode(value,StandardCharsets.UTF_8.name()); }
    private static int retry(HttpsURLConnection connection) { try { return Math.max(3,Math.min(3600,Integer.parseInt(connection.getHeaderField("Retry-After")))); } catch (Exception ignored) { return 60; } }
    static final class ApiError extends Exception {
        final int status,retryAfter;
        ApiError(int status,String message,int retryAfter) { super(message); this.status=status; this.retryAfter=retryAfter; }
    }
}
