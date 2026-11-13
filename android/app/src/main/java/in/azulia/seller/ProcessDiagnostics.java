package in.azulia.seller;

import android.app.ActivityManager;
import android.app.ApplicationExitInfo;
import android.content.Context;
import android.os.Build;

/** Local OS reason codes only; never raw exception descriptions or seller data. */
final class ProcessDiagnostics {
    static String lastExit(Context context) {
        if(Build.VERSION.SDK_INT<30)return "";
        try {
            java.util.List<ApplicationExitInfo> exits=context.getSystemService(ActivityManager.class).getHistoricalProcessExitReasons(context.getPackageName(),0,1);
            if(exits.isEmpty())return "";
            switch(exits.get(0).getReason()) {
                case ApplicationExitInfo.REASON_LOW_MEMORY: return "Android previously stopped Azulia because memory was low.";
                case ApplicationExitInfo.REASON_ANR: return "Android recorded an earlier unresponsive app. Connect debugging to investigate the trace.";
                case ApplicationExitInfo.REASON_CRASH:
                case ApplicationExitInfo.REASON_CRASH_NATIVE: return "Android recorded an earlier app crash. Connect debugging to retrieve its cause.";
                default:return "";
            }
        }catch(Exception unavailable){return "";}
    }
}
