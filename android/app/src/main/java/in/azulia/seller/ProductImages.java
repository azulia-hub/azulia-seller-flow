package in.azulia.seller;

import android.content.Context;
import android.webkit.WebResourceResponse;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Set;
import javax.net.ssl.HttpsURLConnection;

final class ProductImages {
    private static final Set<String> HOSTS=new java.util.HashSet<>(java.util.Arrays.asList("m.media-amazon.com","images.amazon.com","images-na.ssl-images-amazon.com","images-eu.ssl-images-amazon.com","images-fe.ssl-images-amazon.com"));
    private final File directory;
    ProductImages(Context context) { directory=new File(context.getFilesDir(),"product-images"); if (!directory.isDirectory() && !directory.mkdirs()) throw new IllegalStateException("Image directory unavailable."); }
    private static URL allowed(String input) throws Exception {
        URL url=new URL(input);
        if (!url.getProtocol().equals("https") || !HOSTS.contains(url.getHost()) || url.getUserInfo()!=null || url.getPort()!=-1) throw new IllegalArgumentException("Unsupported image URL."); return url;
    }
    private static String hash(String value) throws Exception {
        StringBuilder result=new StringBuilder(); for (byte b : MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))) result.append(String.format(java.util.Locale.ROOT,"%02x",b&255)); return result.toString();
    }
    synchronized JSONObject download(String input) throws Exception {
        URL url=allowed(input); String key=hash(input); File file=new File(directory,key),meta=new File(directory,key+".json");
        if (!file.isFile() || !meta.isFile()) {
            HttpsURLConnection connection=null;
            try {
                for (int redirect=0;redirect<4;redirect++) {
                    connection=AmazonSession.open(url.toString()); int status=connection.getResponseCode();
                    if (status>=300 && status<400) {
                        String location=connection.getHeaderField("Location"); connection.disconnect(); connection=null;
                        if (location==null) throw new IllegalArgumentException("Image redirect unavailable."); url=allowed(new URL(url,location).toString()); continue;
                    }
                    if (status!=200) throw new IllegalStateException("Image unavailable."); break;
                }
                if (connection==null || connection.getResponseCode()!=200) throw new IllegalStateException("Image unavailable.");
                byte[] bytes;
                try (InputStream stream=connection.getInputStream(); ByteArrayOutputStream output=new ByteArrayOutputStream()) {
                    byte[] buffer=new byte[16384]; int read;
                    while ((read=stream.read(buffer))!=-1) { if (output.size()+read>5*1024*1024) throw new IllegalArgumentException("Image exceeds size limit."); output.write(buffer,0,read); }
                    bytes=output.toByteArray();
                }
                String type=type(bytes); if (type==null) throw new IllegalArgumentException("Unsupported image contents.");
                File temporary=File.createTempFile("download-",".tmp",directory);
                try { Files.write(temporary.toPath(),bytes); Files.move(temporary.toPath(),file.toPath(),StandardCopyOption.REPLACE_EXISTING); }
                finally { Files.deleteIfExists(temporary.toPath()); }
                Files.write(meta.toPath(),new JSONObject().put("url",input).put("type",type).put("size",bytes.length).put("savedAt",System.currentTimeMillis()).toString().getBytes(StandardCharsets.UTF_8));
            } finally { if (connection!=null) connection.disconnect(); }
        }
        return new JSONObject().put("url","https://appassets.androidplatform.net/images/"+key);
    }
    android.graphics.Bitmap bitmap(String url) throws Exception { download(url);return bitmapCached(url); }
    android.graphics.Bitmap bitmapCached(String url) throws Exception {
        allowed(url);File file=new File(directory,hash(url));if(!file.isFile())return null;
        android.graphics.BitmapFactory.Options options=new android.graphics.BitmapFactory.Options(); options.inJustDecodeBounds=true;
        android.graphics.BitmapFactory.decodeFile(file.getPath(),options); options.inSampleSize=1;
        while(options.outWidth/options.inSampleSize>512 || options.outHeight/options.inSampleSize>512)options.inSampleSize*=2;
        options.inJustDecodeBounds=false; return android.graphics.BitmapFactory.decodeFile(file.getPath(),options);
    }
    WebResourceResponse serve(String path) {
        try {
            if (!path.matches("[a-f0-9]{64}")) return unavailable();
            File file=new File(directory,path),meta=new File(directory,path+".json");
            String type=new JSONObject(new String(Files.readAllBytes(meta.toPath()),StandardCharsets.UTF_8)).getString("type");
            if (!java.util.Arrays.asList("image/jpeg","image/png","image/webp","image/gif").contains(type)) return unavailable();
            return new WebResourceResponse(type,null,200,"OK",java.util.Collections.singletonMap("Cache-Control","private, max-age=86400"),new FileInputStream(file));
        } catch (Exception ignored) { return unavailable(); }
    }
    private static WebResourceResponse unavailable() { return new WebResourceResponse("text/plain","UTF-8",404,"Not found",java.util.Collections.emptyMap(),new java.io.ByteArrayInputStream(new byte[0])); }
    private static String type(byte[] data) {
        if (data.length>=3 && (data[0]&255)==255 && (data[1]&255)==216 && (data[2]&255)==255) return "image/jpeg";
        if (data.length>=8 && Arrays.equals(Arrays.copyOf(data,8),new byte[]{(byte)137,80,78,71,13,10,26,10})) return "image/png";
        if (data.length>=12 && new String(data,0,4,StandardCharsets.US_ASCII).equals("RIFF") && new String(data,8,4,StandardCharsets.US_ASCII).equals("WEBP")) return "image/webp";
        if (data.length>=6 && new String(data,0,6,StandardCharsets.US_ASCII).matches("GIF8[79]a")) return "image/gif";
        return null;
    }
}
