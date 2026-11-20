package in.azulia.seller;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;
import java.util.zip.GZIPInputStream;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import javax.net.ssl.HttpsURLConnection;

/** Private Ads vault and resumable raw-report transport. All money parsing stays in TypeScript. */
final class AdsSession {
    private static final Object LOCK=new Object();
    private static final String ALIAS="azulia-ads-v1",API="https://advertising-api-eu.amazon.com";
    private final Context context;
    private final SharedPreferences prefs;
    private final AmazonSession seller;
    private final DeviceDatabase database;
    private String access="";private long until;
    private JSONObject specifications;
    AdsSession(Context context,AmazonSession seller,DeviceDatabase database){this.context=context;this.seller=seller;this.database=database;prefs=context.getSharedPreferences("ads-vault",Context.MODE_PRIVATE);}
    private SecretKey key() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(store.containsAlias(ALIAS))return ((KeyStore.SecretKeyEntry)store.getEntry(ALIAS,null)).getSecretKey();
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    private JSONObject credentials() throws Exception {
        String encrypted=prefs.getString("encrypted",null);if(encrypted==null)return null;
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(prefs.getString("iv",""),Base64.NO_WRAP)));
        JSONObject result=new JSONObject(new String(cipher.doFinal(Base64.decode(encrypted,Base64.NO_WRAP)),StandardCharsets.UTF_8));
        if(!result.getString("account").equals(seller.status().optString("account")))return null;
        return result;
    }
    private static String field(JSONObject input,String name,int maximum) throws Exception {
        String value=input.getString(name).trim();if(value.isEmpty()||value.length()>maximum||value.matches("(?s).*[\\r\\n\\x00].*"))throw new IllegalArgumentException("Invalid Ads credentials.");return value;
    }
    JSONObject connect(JSONObject input) throws Exception {synchronized(LOCK){
        String account=seller.status().optString("account");DeviceDatabase.account(account);
        JSONObject value=new JSONObject().put("account",account).put("clientId",field(input,"clientId",1024)).put("clientSecret",field(input,"clientSecret",8192)).put("refreshToken",field(input,"refreshToken",16384)).put("profileId",field(input,"profileId",20)).put("sellerId",field(input,"sellerId",32));
        if(!value.getString("clientId").matches("amzn1\\.application-oa2-client\\.[a-zA-Z0-9-]+")||!value.getString("profileId").matches("[0-9]+")||!value.getString("sellerId").matches("[A-Z0-9]{8,32}"))throw new IllegalArgumentException("Invalid Ads identity.");
        access="";until=0;
        JSONArray profiles=new JSONArray(api(value,"/v2/profiles",null));JSONObject found=null;
        for(int index=0;index<profiles.length();index++){JSONObject p=profiles.getJSONObject(index);if(String.valueOf(p.opt("profileId")).equals(value.getString("profileId")))found=p;}
        if(found==null||!"IN".equals(found.optString("countryCode"))||!"INR".equals(found.optString("currencyCode"))||!"seller".equals(found.getJSONObject("accountInfo").optString("type"))||!value.getString("sellerId").equals(found.getJSONObject("accountInfo").optString("id")))throw new AmazonSession.ApiError(403,"The selected Ads profile is not the configured India seller account.",300);
        value.put("accountName",found.getJSONObject("accountInfo").optString("name",value.getString("sellerId")));
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
        if(!prefs.edit().putString("encrypted",Base64.encodeToString(cipher.doFinal(value.toString().getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP)).putString("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)).commit())throw new IllegalStateException("Ads secure storage failed.");
        JSONObject state=state(value);state.put("verified",true);save(value,state);return status();
    }}
    private String token(JSONObject value) throws Exception {
        if(!access.isEmpty()&&System.currentTimeMillis()<until)return access;
        HttpsURLConnection connection=AmazonSession.open("https://api.amazon.co.uk/auth/o2/token");
        try {
            connection.setRequestMethod("POST");connection.setDoOutput(true);connection.setReadTimeout(15000);connection.setRequestProperty("Content-Type","application/x-www-form-urlencoded;charset=UTF-8");
            String form="grant_type=refresh_token&client_id="+encode(value.getString("clientId"))+"&client_secret="+encode(value.getString("clientSecret"))+"&refresh_token="+encode(value.getString("refreshToken"));
            byte[] bytes=form.getBytes(StandardCharsets.UTF_8);connection.setFixedLengthStreamingMode(bytes.length);try(OutputStream out=connection.getOutputStream()){out.write(bytes);}
            if(connection.getResponseCode()!=200)throw new AmazonSession.ApiError(connection.getResponseCode(),"Amazon Ads token renewal failed. Check the Ads authorization; seller API credentials are separate.",retry(connection));
            JSONObject body=new JSONObject(AmazonSession.read(connection.getInputStream(),32768));access=body.getString("access_token");
            if(access.isEmpty()||access.length()>16384||body.optLong("expires_in")<60)throw new IllegalArgumentException("Invalid Ads token response.");
            until=System.currentTimeMillis()+Math.min(3300,body.getLong("expires_in")-60)*1000;return access;
        }finally{connection.disconnect();}
    }
    private static String encode(String value)throws Exception{return java.net.URLEncoder.encode(value,StandardCharsets.UTF_8.name());}
    private static int retry(HttpsURLConnection c){try{return Math.max(30,Math.min(3600,Integer.parseInt(c.getHeaderField("Retry-After"))));}catch(Exception ignored){return 300;}}
    private String api(JSONObject value,String path,JSONObject body)throws Exception{return api(value,path,body,"application/vnd.createasyncreportrequest.v3+json");}
    private String api(JSONObject value,String path,JSONObject body,String media)throws Exception{
        if(!path.matches("/sp/(campaigns|adGroups|keywords|targets|productAds)/list")&&!path.equals("/v2/profiles")&&!path.equals("/reporting/reports")&&!path.matches("/reporting/reports/[a-zA-Z0-9-]{1,128}"))throw new IllegalArgumentException("Unsupported Ads operation.");
        for(int attempt=0;attempt<2;attempt++){
            HttpsURLConnection c=AmazonSession.open(API+path);c.setReadTimeout(20000);
            try{
                c.setRequestProperty("Authorization","Bearer "+token(value));c.setRequestProperty("Amazon-Advertising-API-ClientId",value.getString("clientId"));c.setRequestProperty("Amazon-Advertising-API-Scope",value.getString("profileId"));
                if(body!=null){c.setRequestMethod("POST");c.setDoOutput(true);c.setRequestProperty("Content-Type",media);c.setRequestProperty("Accept",media);byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);c.setFixedLengthStreamingMode(bytes.length);try(OutputStream out=c.getOutputStream()){out.write(bytes);}}
                int code=c.getResponseCode();
                if(code==401&&attempt==0){access="";until=0;continue;}
                if(code==425&&body!=null&&c.getErrorStream()!=null){JSONObject error=new JSONObject(AmazonSession.read(c.getErrorStream(),32768));java.util.regex.Matcher match=java.util.regex.Pattern.compile("[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}").matcher(error.optString("detail"));if(match.find())return new JSONObject().put("reportId",match.group()).toString();}
                if(code<200||code>=300)throw new AmazonSession.ApiError(code,code==429?"Amazon Ads is rate limited. Saved reports are retained.":"Amazon Ads reporting request failed (HTTP "+code+"). Saved reports are retained.",retry(c));
                return AmazonSession.read(c.getInputStream(),2*1024*1024);
            }finally{c.disconnect();}
        }
        throw new AmazonSession.ApiError(401,"Reconnect Amazon Ads to continue.",300);
    }
    private String identity(JSONObject value)throws Exception{
        String kind=AdsPolicy.kind(value.optString("_kind","advertisedProduct"));int version=configuration(kind).getInt("version");
        String base=value.getString("account")+"\n"+value.getString("clientId")+"\n"+value.getString("profileId")+"\n"+value.getString("sellerId");
        // Preserve the existing product cache and raw files from bridge 11.
        if(!kind.equals("advertisedProduct")||version!=1)base+="\n"+kind+"\n"+version;
        byte[] digest=MessageDigest.getInstance("SHA-256").digest(base.getBytes(StandardCharsets.UTF_8));StringBuilder result=new StringBuilder();for(byte b:digest)result.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return result.toString();
    }
    private JSONObject state(JSONObject value)throws Exception{
        Object saved=database.retained("ads-native:"+identity(value));
        return saved instanceof JSONObject?(JSONObject)saved:new JSONObject().put("revision",0).put("jobs",new JSONArray()).put("days",new JSONObject()).put("sources",new JSONObject()).put("nextAttempt",0).put("verified",true);
    }
    private void save(JSONObject value,JSONObject state)throws Exception{database.retain("ads-native:"+identity(value),state);}
    private LocalDate today(){return LocalDate.now(ZoneId.of("Asia/Kolkata"));}
    private static List<String> sorted(JSONObject object){List<String> keys=new ArrayList<>();Iterator<String> iterator=object.keys();while(iterator.hasNext())keys.add(iterator.next());Collections.sort(keys);return keys;}
    private String[] coverage(JSONObject state)throws Exception{
        List<String> days=sorted(state.getJSONObject("days"));if(days.isEmpty())return null;
        String anchor=state.optString("selectedFrom",""),start=days.get(0),previous=start;List<String[]> intervals=new ArrayList<>();
        for(int i=1;i<days.size();i++){String day=days.get(i);if(!LocalDate.parse(previous).plusDays(1).toString().equals(day)){intervals.add(new String[]{start,previous});start=day;}previous=day;}intervals.add(new String[]{start,previous});
        for(String[] interval:intervals)if(interval[0].compareTo(anchor)<=0&&interval[1].compareTo(anchor)>=0)return interval;
        return intervals.get(intervals.size()-1);
    }
    JSONObject status()throws Exception{return status(new JSONObject());}
    JSONObject status(JSONObject input)throws Exception{synchronized(LOCK){
        String kind=AdsPolicy.kind(input.optString("kind","advertisedProduct"));JSONObject value=credentials();
        if(value==null)return new JSONObject().put("kind",kind).put("configured",false).put("renewalConfigured",false).put("verified",false).put("profileId",JSONObject.NULL).put("revision",0).put("state","idle").put("error",JSONObject.NULL);
        value.put("_kind",kind);return statusFor(value);
    }}
    private JSONObject statusFor(JSONObject value)throws Exception{
        JSONObject state=state(value);String[] range=coverage(state);
        return new JSONObject().put("kind",value.optString("_kind","advertisedProduct")).put("configured",true).put("renewalConfigured",true).put("verified",state.optBoolean("verified")).put("accountName",value.optString("accountName")).put("profileId",value.getString("profileId")).put("sellerId",value.getString("sellerId")).put("identity",identity(value)).put("revision",state.optLong("revision")).put("state",state.has("error")&&!state.isNull("error")?"error":state.getJSONArray("jobs").length()>0?"syncing":"idle").put("error",state.opt("error")).put("lastSync",state.opt("lastSync")).put("from",range==null?JSONObject.NULL:range[0]).put("to",range==null?JSONObject.NULL:range[1]).put("pending",state.getJSONArray("jobs").length()).put("rows",0).put("nextAttempt",state.optLong("nextAttempt"));
    }
    JSONObject request(JSONObject input)throws Exception{synchronized(LOCK){
        JSONObject value=required(input),state=state(value);String from=input.getString("from"),to=input.getString("to");List<String[]> windows=AdsPolicy.windows(from,to,today());
        String[] before=coverage(state);state.put("selectedFrom",from);String[] covered=coverage(state);boolean complete=covered!=null&&covered[0].compareTo(from)<=0&&covered[1].compareTo(to)>=0;
        if(before!=null&&covered!=null&&(!before[0].equals(covered[0])||!before[1].equals(covered[1])))state.put("revision",state.optLong("revision")+1);
        if(!complete||input.optBoolean("force")){JSONArray jobs=state.getJSONArray("jobs");boolean identical=jobs.length()>0&&jobs.getJSONObject(0).getString("from").compareTo(from)<=0&&jobs.getJSONObject(jobs.length()-1).getString("to").compareTo(to)>=0;if(!identical){JSONArray next=new JSONArray();for(String[] window:windows)next.put(new JSONObject().put("from",window[0]).put("to",window[1]));if(jobs.length()==0)state.put("jobs",next);else state.put("nextJobs",next);}}
        save(value,state);return statusFor(value);
    }}
    private JSONObject required(JSONObject input)throws Exception{String kind=AdsPolicy.kind(input.optString("kind","advertisedProduct"));JSONObject value=credentials();if(value==null)throw new AmazonSession.ApiError(401,"Import Ads credentials on this phone first.",60);if(input.has("profileId")&&!input.getString("profileId").equals(value.getString("profileId")))throw new AmazonSession.ApiError(409,"The advertising profile changed.",60);return value.put("_kind",kind);}
    private JSONObject configuration(String kind)throws Exception{
        AdsPolicy.kind(kind);
        if(specifications==null){JSONObject source=new JSONObject(AmazonSession.read(context.getAssets().open("web/ads-report-specs.json"),32768));if(source.getInt("schema")!=1)throw new IllegalArgumentException("Unsupported Ads report specification version.");specifications=source.getJSONObject("reports");}
        return specifications.getJSONObject(kind);
    }
    private JSONObject spec(JSONObject job,String kind)throws Exception{
        JSONObject config=new JSONObject(configuration(kind).getJSONObject("configuration").toString());
        if(!config.getString("adProduct").equals("SPONSORED_PRODUCTS")||!config.getString("reportTypeId").matches("sp(?:AdvertisedProduct|SearchTerm|PurchasedProduct|Targeting)"))throw new IllegalArgumentException("Unsupported Ads source configuration.");
        return new JSONObject().put("name","Azulia "+kind+" "+job.getString("from")+" "+job.getString("to")).put("startDate",job.getString("from")).put("endDate",job.getString("to")).put("configuration",config);
    }
    JSONObject cycle(JSONObject input)throws Exception{synchronized(LOCK){
        String kind=AdsPolicy.kind(input.optString("kind","advertisedProduct"));JSONObject value=credentials();if(value==null)return status(input);value.put("_kind",kind);JSONObject state=state(value);JSONArray jobs=state.getJSONArray("jobs");
        if(System.currentTimeMillis()<state.optLong("nextAttempt")||System.currentTimeMillis()<prefs.getLong("next-network",0))return pendingStatus(value,state);
        try{
            if(jobs.length()==0){
                if(state.has("nextJobs")){jobs=state.getJSONArray("nextJobs");state.remove("nextJobs");state.put("jobs",jobs);}
                else if(System.currentTimeMillis()-state.optLong("completedAt")>=3600000){LocalDate end=today(),start=end.minusDays(state.optLong("revision")==0?29:7);jobs=new JSONArray();jobs.put(new JSONObject().put("from",start.toString()).put("to",end.toString()));state.put("jobs",jobs);}
            }
            if(jobs.length()==0)return statusFor(value);JSONObject job=jobs.getJSONObject(0);
            if(job.has("download"))return pendingStatus(value,state);
            prefs.edit().putLong("next-network",System.currentTimeMillis()+1000).apply();
            if(!job.has("id")){String id=new JSONObject(api(value,"/reporting/reports",spec(job,kind))).getString("reportId");if(!id.matches("[a-zA-Z0-9-]{1,128}"))throw new IllegalArgumentException("Invalid Ads report ID.");job.put("id",id);}
            else {JSONObject report=new JSONObject(api(value,"/reporting/reports/"+job.getString("id"),null));String status=report.optString("status");
                if(status.equals("FAILED")){job.remove("id");throw new AmazonSession.ApiError(502,"Amazon could not generate the Ads report. Retrying later.",1800);}
                if(status.equals("COMPLETED"))job.put("download",download(value,AdsPolicy.download(report.getString("url")),job));
                else if(!status.equals("PENDING")&&!status.equals("PROCESSING"))throw new IllegalArgumentException("Unknown Ads report state.");
            }
            state.put("nextAttempt",System.currentTimeMillis()+30000);state.remove("error");save(value,state);return pendingStatus(value,state);
        }catch(Exception cause){state.put("error",cause instanceof AmazonSession.ApiError?cause.getMessage():"Ads report could not be fetched. Saved results retained.");state.put("nextAttempt",System.currentTimeMillis()+(cause instanceof AmazonSession.ApiError?((AmazonSession.ApiError)cause).retryAfter:300)*1000L);if(cause instanceof AmazonSession.ApiError&&(((AmazonSession.ApiError)cause).status==429||((AmazonSession.ApiError)cause).status==401))prefs.edit().putLong("next-network",state.getLong("nextAttempt")).apply();save(value,state);return statusFor(value);}
    }}
    private JSONObject pendingStatus(JSONObject value,JSONObject state)throws Exception{JSONObject result=statusFor(value);JSONArray jobs=state.getJSONArray("jobs");if(jobs.length()>0&&jobs.getJSONObject(0).has("download"))result.put("download",jobs.getJSONObject(0).getJSONObject("download"));return result;}
    private File directory(JSONObject value)throws Exception{File directory=new File(new File(context.getFilesDir(),"ads-reports"),identity(value));if(!directory.isDirectory()&&!directory.mkdirs())throw new IOException("Ads storage unavailable.");return directory;}
    private JSONObject download(JSONObject value,String url,JSONObject job)throws Exception{
        String id=UUID.randomUUID().toString();File target=new File(directory(value),id+".json"),temporary=new File(directory(value),id+".partial");HttpsURLConnection connection=AmazonSession.open(url);
        try{
            connection.setReadTimeout(30000);if(connection.getResponseCode()!=200)throw new AmazonSession.ApiError(connection.getResponseCode(),"Ads download failed. Retrying later.",60);
            if(connection.getContentLengthLong()>16*1024*1024)throw new IOException("Ads download exceeds limit.");
            long total=0;
            try(PushbackInputStream source=new PushbackInputStream(new BufferedInputStream(connection.getInputStream()),2);FileOutputStream out=new FileOutputStream(temporary)){
                byte[] signature=new byte[2];int length=0;for(int i=0;i<2;i++){int b=source.read();if(b<0)break;signature[length++]=(byte)b;}if(length>0)source.unread(signature,0,length);
                InputStream decoded=length==2&&(signature[0]&255)==31&&(signature[1]&255)==139?new GZIPInputStream(source):source;
                byte[] buffer=new byte[32768];int read;while((read=decoded.read(buffer))!=-1){total+=read;if(total>16*1024*1024)throw new IOException("Ads expanded report exceeds limit.");out.write(buffer,0,read);}out.getFD().sync();
            }
            if(!temporary.renameTo(target))throw new IOException("Ads report save failed.");
            return new JSONObject().put("id",id).put("from",job.getString("from")).put("to",job.getString("to")).put("bytes",total);
        }finally{connection.disconnect();if(temporary.exists())temporary.delete();}
    }
    JSONObject accept(JSONObject input,boolean accepted)throws Exception{synchronized(LOCK){
        JSONObject value=required(input),state=state(value);JSONArray jobs=state.getJSONArray("jobs");if(jobs.length()==0)throw new AmazonSession.ApiError(409,"Ads observation already handled.",30);
        JSONObject job=jobs.getJSONObject(0),source=job.getJSONObject("download");if(!source.getString("id").equals(input.getString("id")))throw new AmazonSession.ApiError(409,"Ads observation changed.",30);
        // Raw files, including rejected observations, remain private evidence.
        state.getJSONObject("sources").put(source.getString("id"),source);
        if(accepted){JSONObject days=state.getJSONObject("days");for(LocalDate day=LocalDate.parse(source.getString("from"));!day.isAfter(LocalDate.parse(source.getString("to")));day=day.plusDays(1))days.put(day.toString(),source.getString("id"));jobs.remove(0);state.put("revision",state.optLong("revision")+1).put("completedAt",System.currentTimeMillis()).put("lastSync",java.time.Instant.now().toString());state.remove("error");}
        else{job.remove("download");job.remove("id");state.put("error","Advertising source validation failed. Previous results and raw evidence retained.").put("nextAttempt",System.currentTimeMillis()+300000);}
        save(value,state);return statusFor(value);
    }}
    JSONObject index(JSONObject input)throws Exception{synchronized(LOCK){
        JSONObject value=required(input),state=state(value);String[] range=coverage(state);JSONObject result=statusFor(value);JSONArray sources=new JSONArray();
        if(range!=null){JSONObject days=state.getJSONObject("days"),grouped=new JSONObject();for(String day:sorted(days)){if(day.compareTo(range[0])<0||day.compareTo(range[1])>0)continue;String id=days.getString(day);if(!grouped.has(id))grouped.put(id,new JSONArray());grouped.getJSONArray(id).put(day);}for(String id:sorted(grouped)){JSONObject source=new JSONObject(state.getJSONObject("sources").getJSONObject(id).toString());source.put("days",grouped.getJSONArray(id));sources.put(source);}}
        return result.put("sources",sources);
    }}
    JSONObject chunk(JSONObject input)throws Exception{synchronized(LOCK){
        JSONObject value=required(input),state=state(value);String id=input.getString("id");if(!AdsPolicy.sourceId(id))throw new IllegalArgumentException("Invalid Ads observation.");
        boolean known=state.getJSONObject("sources").has(id);JSONArray jobs=state.getJSONArray("jobs");if(jobs.length()>0&&jobs.getJSONObject(0).has("download"))known|=jobs.getJSONObject(0).getJSONObject("download").getString("id").equals(id);
        if(!known)throw new IllegalArgumentException("Ads observation is not part of this account.");long offset=input.getLong("offset");File file=new File(directory(value),id+".json");if(offset<0||offset>file.length())throw new IllegalArgumentException("Invalid Ads offset.");
        byte[] bytes=new byte[(int)Math.min(65536,file.length()-offset)];try(RandomAccessFile source=new RandomAccessFile(file,"r")){source.seek(offset);source.readFully(bytes);}
        return new JSONObject().put("data",Base64.encodeToString(bytes,Base64.NO_WRAP)).put("next",offset+bytes.length).put("done",offset+bytes.length>=file.length());
    }}
    JSONObject entities(JSONObject input)throws Exception{synchronized(LOCK){
        JSONObject value=required(input);String entity=input.getString("entity"),media;
        switch(entity){case "campaigns":media="spCampaign";break;case "adGroups":media="spAdGroup";break;case "keywords":media="spKeyword";break;case "targets":media="spTargetingClause";break;case "productAds":media="spProductAd";break;default:throw new IllegalArgumentException("Unsupported Ads entity.");}
        String cursor=input.optString("nextToken","");if(cursor.length()>8000||cursor.indexOf(10)>=0||cursor.indexOf(13)>=0||cursor.indexOf(0)>=0)throw new IllegalArgumentException("Invalid Ads continuation.");
        JSONObject body=new JSONObject().put("maxResults",100).put("stateFilter",new JSONObject().put("include",new JSONArray().put("ENABLED").put("PAUSED").put("ARCHIVED")));
        if(!cursor.isEmpty())body.put("nextToken",cursor);
        return new JSONObject(api(value,"/sp/"+entity+"/list",body,"application/vnd."+media+".v3+json"));
    }}
    JSONObject forget()throws Exception{synchronized(LOCK){access="";until=0;if(!prefs.edit().remove("encrypted").remove("iv").commit())throw new IllegalStateException("Ads removal failed.");return new JSONObject().put("forgotten",true);}}
}
