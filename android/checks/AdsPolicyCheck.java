package in.azulia.seller;

import java.time.LocalDate;

public final class AdsPolicyCheck {
    public static void main(String[] args)throws Exception{
        for(String kind:AdsPolicy.REPORT_KINDS)if(!AdsPolicy.kind(kind).equals(kind))throw new AssertionError("Known report kind rejected");
        for(String kind:new String[]{"","unknown","../searchTerm","SearchTerm"}){boolean rejected=false;try{AdsPolicy.kind(kind);}catch(Exception expected){rejected=true;}if(!rejected)throw new AssertionError("Unknown report kind allowed");}
        String allowed="https://offline-report-storage-eu.s3.eu-west-1.amazonaws.com/report.gz?signature=private";
        if(!AdsPolicy.download(allowed).equals(allowed))throw new AssertionError("Signed report URL rejected");
        for(String url:new String[]{"http://reports.s3.amazonaws.com/x","https://127.0.0.1/x","https://reports.s3.amazonaws.com.evil.test/x","https://user@reports.s3.amazonaws.com/x","https://reports.s3.amazonaws.com:8443/x"}){
            boolean rejected=false;try{AdsPolicy.download(url);}catch(Exception expected){rejected=true;}if(!rejected)throw new AssertionError("Unsafe report URL allowed");
        }
        java.util.List<String[]> windows=AdsPolicy.windows("2026-08-17","2026-11-18",LocalDate.parse("2026-11-18"));
        if(windows.size()!=4||!windows.get(0)[1].equals("2026-09-16")||!windows.get(1)[0].equals("2026-09-17"))throw new AssertionError("Overlapping or oversized report windows");
        for(String[] range:new String[][]{{"2026-02-30","2026-11-18"},{"2026-08-01","2026-11-18"},{"2026-11-18","2026-11-19"}}){
            boolean rejected=false;try{AdsPolicy.windows(range[0],range[1],LocalDate.parse("2026-11-18"));}catch(Exception expected){rejected=true;}if(!rejected)throw new AssertionError("Unavailable report range allowed");
        }
        System.out.println("Ads native host/date policy checks passed.");
    }
}
