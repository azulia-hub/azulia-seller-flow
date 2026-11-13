package in.azulia.seller;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import android.webkit.WebView;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Arrays;
import java.util.HashSet;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Predicate;

/** User-initiated generated-file saves, separate from the seller-data bridge. */
final class ToolDownloads {
    private static final int PICK_FILE=41, MAX_BYTES=128*1024*1024, CHUNK_BYTES=65536;
    private final Activity activity;
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private volatile long epoch=0;
    private volatile boolean closed=false;
    private Job job;
    private Pending pending; // Main thread only, while the system picker is open.
    private static final class Job {
        final String token=UUID.randomUUID().toString(), name, mime;
        final File file;
        final int size;
        int written=0;
        boolean saving=false;
        Job(File file,String name,String mime,int size){this.file=file;this.name=name;this.mime=mime;this.size=size;}
    }
    private static final class Pending {
        final Job job;final String id;final JavaScriptReplyProxy reply;final long epoch;
        Pending(Job job,String id,JavaScriptReplyProxy reply,long epoch){this.job=job;this.id=id;this.reply=reply;this.epoch=epoch;}
    }
    ToolDownloads(Activity activity,WebView web,Predicate<Uri> trusted){
        this.activity=activity;
        WebViewCompat.addWebMessageListener(web,"AzuliaDownloads",new HashSet<>(Arrays.asList("https://azulia-hub.github.io","https://appassets.androidplatform.net")),(view,message,origin,main,reply)->{
            Uri current=Uri.parse(view.getUrl()==null?"":view.getUrl());
            if(closed||!main||!trusted.test(current)||origin.getHost()==null||!origin.getHost().equals(current.getHost())||message.getType()!=WebMessageCompat.TYPE_STRING)return;
            String raw=message.getData();long generation=epoch;
            if(raw==null||raw.length()>100000)return;
            io.execute(()->receive(raw,reply,generation));
        });
    }
    private void respond(JavaScriptReplyProxy reply,String id,Object result,String error,long generation){
        activity.runOnUiThread(()->{
            if(closed||generation!=epoch)return;
            try {JSONObject value=new JSONObject().put("id",id);if(error!=null)value.put("error",error);else value.put("result",result);reply.postMessage(value.toString());}catch(Exception ignored){}
        });
    }
    private void receive(String raw,JavaScriptReplyProxy reply,long generation){
        String id="";
        try {
            if(closed||generation!=epoch)return;
            JSONObject input=new JSONObject(raw);id=input.getString("id");String action=input.getString("action");
            if("begin".equals(action)){
                if(job!=null)throw new Exception("Another file save is in progress.");
                String name=input.getString("name"),mime=input.getString("mime");int size=input.getInt("size");
                if(size<=0||size>MAX_BYTES||!name.matches("[A-Za-z0-9._-]{1,120}")||!(name.endsWith(".pdf")&&mime.equals("application/pdf")||name.endsWith(".csv")&&mime.equals("text/csv")))throw new Exception("Unsupported export file or size.");
                job=new Job(File.createTempFile("azulia-export-",".tmp",activity.getCacheDir()),name,mime,size);
                respond(reply,id,new JSONObject().put("token",job.token),null,generation);return;
            }
            if(job==null||!job.token.equals(input.getString("token")))throw new Exception("This file save has expired. Try again.");
            if(job.saving)throw new Exception("Finish the open Save file dialog first.");
            if("chunk".equals(action)){
                if(input.getInt("offset")!=job.written)throw new Exception("File transfer position mismatch. Try saving again.");
                byte[] bytes=Base64.decode(input.getString("data"),Base64.NO_WRAP);
                if(bytes.length==0||bytes.length>CHUNK_BYTES||job.written+bytes.length>job.size)throw new Exception("Invalid export chunk.");
                try(FileOutputStream stream=new FileOutputStream(job.file,true)){stream.write(bytes);}job.written+=bytes.length;
                respond(reply,id,new JSONObject().put("written",job.written),null,generation);return;
            }
            if("cancel".equals(action)){cleanup();respond(reply,id,new JSONObject(),null,generation);return;}
            if(!"finish".equals(action)||job.written!=job.size)throw new Exception("The export is incomplete. Try saving again.");
            job.saving=true;Pending save=new Pending(job,id,reply,generation);
            activity.runOnUiThread(()->{
                if(closed||generation!=epoch)return;
                pending=save;
                try {activity.startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(save.job.mime).putExtra(Intent.EXTRA_TITLE,save.job.name),PICK_FILE);}
                catch(Exception error){pending=null;io.execute(()->{cleanup();respond(save.reply,save.id,null,"No file-saving app is available.",save.epoch);});}
            });
        }catch(Exception error){respond(reply,id,null,error.getMessage()==null?"Could not save the file.":error.getMessage(),generation);}
    }
    boolean result(int requestCode,int resultCode,Intent data){
        if(requestCode!=PICK_FILE)return false;
        Pending save=pending;pending=null;if(save==null||closed)return true;
        Uri target=data==null?null:data.getData();
        io.execute(()->{
            if(save.epoch!=epoch||closed)return;
            try {
                if(resultCode!=Activity.RESULT_OK||target==null){respond(save.reply,save.id,new JSONObject().put("cancelled",true),null,save.epoch);return;}
                try(FileInputStream input=new FileInputStream(save.job.file);OutputStream output=activity.getContentResolver().openOutputStream(target,"wt")){
                    if(output==null)throw new Exception("Cannot write to this location.");
                    byte[] buffer=new byte[CHUNK_BYTES];int count;while((count=input.read(buffer))!=-1)output.write(buffer,0,count);output.flush();
                }
                respond(save.reply,save.id,new JSONObject().put("saved",true),null,save.epoch);
            }catch(Exception error){respond(save.reply,save.id,null,"Could not write the file. Choose another save location and retry.",save.epoch);}
            finally{cleanup();}
        });return true;
    }
    private void cleanup(){if(job!=null){job.file.delete();job=null;}}
    void documentChanged(){epoch++;pending=null;if(!closed)io.execute(this::cleanup);}
    void close(){closed=true;epoch++;pending=null;io.execute(this::cleanup);io.shutdown();}
}
