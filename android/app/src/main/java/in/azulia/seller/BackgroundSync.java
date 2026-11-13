package in.azulia.seller;
import android.app.job.*;
import android.content.*;
import org.json.JSONObject;
/** Android scheduled fallback invokes the exact same fetch/calculation pipeline. */
public final class BackgroundSync extends JobService {
    private static final int JOB=7601;static volatile boolean foreground;
    static void schedule(Context context){JobScheduler scheduler=context.getSystemService(JobScheduler.class);if(scheduler.getPendingJob(JOB)==null)scheduler.schedule(new JobInfo.Builder(JOB,new ComponentName(context,BackgroundSync.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(JobInfo.getMinPeriodMillis()).setPersisted(true).setBackoffCriteria(60000,JobInfo.BACKOFF_POLICY_EXPONENTIAL).build());}
    static void cancel(Context context){context.getSystemService(JobScheduler.class).cancel(JOB);}
    @Override public boolean onStartJob(JobParameters params){
        if(LiveSync.running||HeadlessSync.busy()||!LiveSync.networkAllowed(this))return false;
        try{if(!new AmazonSession(this).status().optBoolean("configured")){cancel(this);return false;}
            JSONObject intent=new JSONObject().put("budgetMs",30000);HeadlessSync.start(this,intent,()->jobFinished(params,false));return true;
        }catch(Exception unavailable){return false;}
    }
    @Override public boolean onStopJob(JobParameters params){if(!LiveSync.running)HeadlessSync.stop();return true;}
}
