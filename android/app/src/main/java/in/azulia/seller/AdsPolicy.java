package in.azulia.seller;

import java.net.URI;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/** Fixed read/report capabilities. No campaign mutations or arbitrary download hosts. */
final class AdsPolicy {
    static final String[] REPORT_KINDS={"advertisedProduct","searchTerm","purchasedProduct","targeting"};
    static String kind(String value){for(String kind:REPORT_KINDS)if(kind.equals(value))return kind;throw new IllegalArgumentException("Unsupported Ads report kind.");}
    static String download(String value) throws Exception {
        if(value==null || value.length()>16000)throw new IllegalArgumentException("Invalid Ads download.");
        URI uri=new URI(value);
        if(!"https".equals(uri.getScheme()) || uri.getPort()!=-1 || uri.getRawUserInfo()!=null || uri.getRawFragment()!=null || uri.getHost()==null
            || !uri.getHost().matches("[a-z0-9.-]+\\.s3(?:[.-][a-z0-9-]+)?\\.amazonaws\\.com"))throw new IllegalArgumentException("Unsupported Ads download host.");
        return uri.toString();
    }
    static List<String[]> windows(String from,String to,LocalDate today) {
        LocalDate start=LocalDate.parse(from),end=LocalDate.parse(to);
        if(!start.toString().equals(from)||!end.toString().equals(to)||start.isAfter(end)||end.isAfter(today)||start.isBefore(today.minusDays(94)))throw new IllegalArgumentException("Choose Ads dates within the last 95 days.");
        List<String[]> result=new ArrayList<>();
        while(!start.isAfter(end)){LocalDate last=start.plusDays(30);if(last.isAfter(end))last=end;result.add(new String[]{start.toString(),last.toString()});start=last.plusDays(1);}
        return result;
    }
    static boolean sourceId(String id){return id!=null&&id.matches("[a-f0-9-]{36}");}
}
