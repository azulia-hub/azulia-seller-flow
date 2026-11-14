package in.azulia.seller;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.UUID;

/** Private retained JSON values, chunked below CursorWindow row limits. Never expires data. */
final class DeviceDatabase extends SQLiteOpenHelper {
    DeviceDatabase(Context context) { super(context, "seller.sqlite", null, 1); setWriteAheadLoggingEnabled(true); }
    @Override public void onConfigure(SQLiteDatabase db) { db.setForeignKeyConstraintsEnabled(true); }
    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE retained(name TEXT PRIMARY KEY, version INTEGER NOT NULL)");
        db.execSQL("CREATE TABLE chunks(name TEXT NOT NULL, part INTEGER NOT NULL, raw TEXT NOT NULL, PRIMARY KEY(name,part), FOREIGN KEY(name) REFERENCES retained(name) ON DELETE CASCADE)");
        db.execSQL("CREATE TABLE source_index(account TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,value_key TEXT NOT NULL,PRIMARY KEY(account,kind,id))");
        db.execSQL("CREATE TABLE source_history(account TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,observed INTEGER NOT NULL,value_key TEXT NOT NULL)");
        db.execSQL("CREATE INDEX history_account ON source_history(account,observed)");
    }
    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) { throw new IllegalStateException("Database migration required; existing data retained."); }
    static void account(String account) { if (!account.matches("[a-f0-9]{64}")) throw new IllegalArgumentException("Invalid account."); }
    static void kind(String kind) { if (!kind.equals("records") && !kind.equals("orders") && !kind.equals("catalog")) throw new IllegalArgumentException("Invalid source collection."); }
    static void workspace(String key) { if (!key.matches("(?:settings|(?:reading|inventory|inventory-config|inventory-alerts|reviews|reviews-config|recovery-inspections):[a-f0-9]{64}|review-attempt:[a-f0-9]{64}:[A-Z0-9]{3}-[0-9]{7}-[0-9]{7})")) throw new IllegalArgumentException("Invalid workspace key."); }
    private long version(SQLiteDatabase db, String key) {
        try (Cursor cursor = db.rawQuery("SELECT version FROM retained WHERE name=?", new String[]{key})) { return cursor.moveToFirst() ? cursor.getLong(0) : 0; }
    }
    private Object value(SQLiteDatabase db, String key) throws Exception {
        if (version(db,key) == 0) return JSONObject.NULL;
        StringBuilder raw = new StringBuilder();
        try (Cursor cursor = db.rawQuery("SELECT raw FROM chunks WHERE name=? ORDER BY part", new String[]{key})) { while (cursor.moveToNext()) raw.append(cursor.getString(0)); }
        return new org.json.JSONTokener(raw.toString()).nextValue();
    }
    private void write(SQLiteDatabase db, String key, Object value, long version) {
        String raw = value.toString();
        ContentValues header = new ContentValues(); header.put("name",key); header.put("version",version);
        db.insertWithOnConflict("retained",null,header,SQLiteDatabase.CONFLICT_REPLACE);
        // REPLACE cascades old chunks within this same transaction.
        for (int start=0, part=0; start<raw.length(); part++) {
            int end=Math.min(start+240000,raw.length());
            if (end<raw.length() && Character.isHighSurrogate(raw.charAt(end-1))) end--;
            ContentValues row=new ContentValues(); row.put("name",key); row.put("part",part); row.put("raw",raw.substring(start,end));
            db.insertOrThrow("chunks",null,row); start=end;
        }
    }
    void discardUploadStaging() {
        // Only incomplete transport uploads; committed readings and source history are untouched.
        getWritableDatabase().delete("retained","name LIKE 'upload:%'",null);
    }
    JSONObject readingStatus(String account) throws Exception {
        account(account);Object info=retained("reading-state:reading:"+account);
        JSONObject status=info instanceof JSONObject?new JSONObject(info.toString()):new JSONObject().put("revision",-1).put("calculatedAt",JSONObject.NULL);
        return status.put("version",version(getReadableDatabase(),"reading:"+account));
    }
    JSONObject workspaceHead(String key) throws Exception { workspace(key);return new JSONObject().put("version",version(getReadableDatabase(),key)); }
    JSONObject workspaceGet(String key) throws Exception {
        workspace(key); SQLiteDatabase db=getReadableDatabase();
        if (key.startsWith("reading:") || key.startsWith("inventory:") || key.startsWith("reviews:")) {
            try (Cursor cursor=db.rawQuery("SELECT count(*) FROM chunks WHERE name=?",new String[]{key})) {
                cursor.moveToFirst(); return new JSONObject().put("version",version(db,key)).put("value",JSONObject.NULL).put("chunked",true).put("parts",cursor.getInt(0));
            }
        }
        return new JSONObject().put("version",version(db,key)).put("value",value(db,key));
    }
    JSONObject workspaceChunk(JSONObject input) throws Exception {
        String key=input.getString("key"); workspace(key); SQLiteDatabase db=getReadableDatabase();
        if (version(db,key)!=input.getLong("version")) throw new Conflict();
        try (Cursor cursor=db.rawQuery("SELECT raw FROM chunks WHERE name=? AND part=?",new String[]{key,String.valueOf(input.getInt("part"))})) {
            if (!cursor.moveToFirst()) throw new IllegalArgumentException("Missing saved reading chunk.");
            return new JSONObject().put("data",cursor.getString(0));
        }
    }
    private String uploadKey(String id) { if (!id.matches("[a-f0-9-]{36}")) throw new IllegalArgumentException("Invalid upload."); return "upload:"+id; }
    JSONObject workspaceUpload(JSONObject input) throws Exception {
        String action=input.getString("step"); SQLiteDatabase db=getWritableDatabase(); db.beginTransaction();
        try {
            if (action.equals("begin")) {
                String key=input.getString("key"); workspace(key);
                if (!key.startsWith("reading:") && !key.startsWith("inventory:") && !key.startsWith("reviews:")) throw new IllegalArgumentException("Only readings use chunk uploads.");
                int parts=input.getInt("parts"); if (parts<1 || parts>4096) throw new IllegalArgumentException("Reading exceeds supported size.");
                long base=version(db,key); if (input.has("version") && !input.isNull("version") && input.getLong("version")!=base) throw new Conflict();
                String id=UUID.randomUUID().toString(),name=uploadKey(id);
                ContentValues header=new ContentValues(); header.put("name",name); header.put("version",1); db.insertOrThrow("retained",null,header);
                write(db,name+":meta",new JSONObject().put("key",key).put("base",base).put("parts",parts).put("info",input.optJSONObject("info")),1);
                db.setTransactionSuccessful(); return new JSONObject().put("id",id);
            }
            String name=uploadKey(input.getString("id"));
            JSONObject meta=(JSONObject)value(db,name+":meta");
            if (action.equals("part")) {
                int part=input.getInt("part"); String data=input.getString("data");
                if (part<0 || part>=meta.getInt("parts") || data.length()>240000) throw new IllegalArgumentException("Invalid reading chunk.");
                ContentValues row=new ContentValues(); row.put("name",name); row.put("part",part); row.put("raw",data); db.insertWithOnConflict("chunks",null,row,SQLiteDatabase.CONFLICT_REPLACE);
                db.setTransactionSuccessful(); return new JSONObject().put("saved",true);
            }
            if (!action.equals("abort")) {
                if (!action.equals("commit")) throw new IllegalArgumentException("Invalid upload operation.");
                String key=meta.getString("key");
                JSONObject info=meta.optJSONObject("info");
                if(info!=null) {
                    Object source=value(db,"meta:"+key.substring(8));
                    if(source instanceof JSONObject && ((JSONObject)source).optLong("revision")!=info.optLong("revision"))throw new Conflict();
                }
                long base=version(db,key); if (base!=meta.getLong("base")) throw new Conflict();
                try (Cursor cursor=db.rawQuery("SELECT count(*) FROM chunks WHERE name=?",new String[]{name})) { cursor.moveToFirst(); if (cursor.getInt(0)!=meta.getInt("parts")) throw new IllegalArgumentException("Reading upload is incomplete."); }
                ContentValues header=new ContentValues(); header.put("name",key); header.put("version",base+1); db.insertWithOnConflict("retained",null,header,SQLiteDatabase.CONFLICT_REPLACE);
                db.execSQL("INSERT INTO chunks(name,part,raw) SELECT ?,part,raw FROM chunks WHERE name=?",new Object[]{key,name});
            }
            if(action.equals("commit") && meta.optJSONObject("info")!=null)write(db,"reading-state:"+meta.getString("key"),meta.getJSONObject("info"),version(db,meta.getString("key")));
            db.delete("retained","name IN (?,?)",new String[]{name,name+":meta"}); db.setTransactionSuccessful();
            return new JSONObject().put("version",version(db,meta.getString("key")));
        } finally { db.endTransaction(); }
    }
    JSONObject workspacePut(JSONObject input) throws Exception {
        String key=input.getString("key"); workspace(key);
        SQLiteDatabase db=getWritableDatabase(); db.beginTransaction();
        try {
            long old=version(db,key);
            if (input.has("version") && !input.isNull("version") && input.getLong("version")!=old) throw new Conflict();
            Object next=input.get("value");
            if (!(next instanceof JSONObject) && !(next instanceof JSONArray)) throw new IllegalArgumentException("Invalid workspace value.");
            write(db,key,next,old+1); db.setTransactionSuccessful(); return new JSONObject().put("version",old+1);
        } finally { db.endTransaction(); }
    }
    JSONObject begin(JSONObject input) throws Exception {
        String account=input.getString("account"); account(account); SQLiteDatabase db=getReadableDatabase();
        String meta="meta:"+account; JSONArray entries=new JSONArray(); JSONObject keys=input.optJSONObject("keys");
        db.beginTransaction();
        try {
            if (keys!=null) for (String kind : new String[]{"records","orders","catalog"}) {
                JSONArray ids=keys.optJSONArray(kind); if (ids==null) continue;
                if (ids.length()>1000) throw new IllegalArgumentException("Source batch too large.");
                for (int i=0;i<ids.length();i++) {
                    String id=ids.getString(i); Object row=value(db,sourceKey(account,kind,id));
                    if (row!=JSONObject.NULL) entries.put(new JSONObject().put("kind",kind).put("id",id).put("value",row));
                }
            }
            JSONObject result=new JSONObject().put("version",version(db,meta)).put("state",value(db,meta)).put("entries",entries);
            db.setTransactionSuccessful(); return result;
        } finally { db.endTransaction(); }
    }
    private String sourceKey(String account,String kind,String id) {
        kind(kind); if (id.isEmpty() || id.length()>8192) throw new IllegalArgumentException("Invalid source identity.");
        return "source:"+account+":"+kind+":"+id;
    }
    JSONObject commit(JSONObject input) throws Exception {
        String account=input.getString("account"); account(account); String meta="meta:"+account;
        JSONObject state=input.getJSONObject("state"); if (!account.equals(state.getString("account"))) throw new IllegalArgumentException("Account mismatch.");
        JSONArray entries=input.getJSONArray("entries"); if (entries.length()>1000) throw new IllegalArgumentException("Source batch too large.");
        SQLiteDatabase db=getWritableDatabase(); db.beginTransaction();
        try {
            long current=version(db,meta); if (current!=input.getLong("version")) throw new Conflict();
            for (int i=0;i<entries.length();i++) {
                JSONObject row=entries.getJSONObject(i); String kind=row.getString("kind"),id=row.getString("id"),key=sourceKey(account,kind,id);
                Object next=row.get("value"),old=value(db,key);
                if (old!=JSONObject.NULL) {
                    String archive="history:"+UUID.randomUUID(); write(db,archive,old,1);
                    ContentValues history=new ContentValues(); history.put("account",account); history.put("kind",kind); history.put("id",id); history.put("observed",System.currentTimeMillis()); history.put("value_key",archive);
                    db.insertOrThrow("source_history",null,history);
                }
                write(db,key,next,version(db,key)+1);
                ContentValues index=new ContentValues(); index.put("account",account); index.put("kind",kind); index.put("id",id); index.put("value_key",key);
                db.insertWithOnConflict("source_index",null,index,SQLiteDatabase.CONFLICT_REPLACE);
            }
            if (input.has("backgroundId") && !input.isNull("backgroundId")) {
                String id=input.getString("backgroundId"); if (!id.matches("[a-f0-9-]{36}")) throw new IllegalArgumentException("Invalid background page.");
                String key="inbox:"+account+":"+id;
                if (version(db,key)==0) throw new Conflict();
                db.delete("retained","name=?",new String[]{key});
            }
            write(db,meta,state,current+1); db.setTransactionSuccessful(); return new JSONObject().put("version",current+1);
        } finally { db.endTransaction(); }
    }
    JSONObject count(String account) throws Exception {
        account(account);
        try(Cursor cursor=getReadableDatabase().rawQuery("SELECT count(*) FROM source_index WHERE account=? AND kind='records'",new String[]{account})) {
            cursor.moveToFirst();return new JSONObject().put("count",cursor.getLong(0));
        }
    }
    JSONObject list(JSONObject input) throws Exception {
        String account=input.getString("account"),kind=input.getString("kind"),after=input.optString("after",""); account(account); kind(kind);
        SQLiteDatabase db=getReadableDatabase(); JSONArray entries=new JSONArray(); int bytes=0;
        try (Cursor cursor=db.rawQuery("SELECT id,value_key FROM source_index WHERE account=? AND kind=? AND id>? ORDER BY id LIMIT 100",new String[]{account,kind,after})) {
            while (cursor.moveToNext()) {
                Object item=value(db,cursor.getString(1));
                if (bytes>1024*1024) break;
                entries.put(new JSONObject().put("id",cursor.getString(0)).put("value",item)); bytes+=item.toString().length()*2;
            }
        }
        return new JSONObject().put("entries",entries);
    }
    void releaseLeases() throws Exception {
        SQLiteDatabase db=getWritableDatabase(); db.beginTransaction();
        try (Cursor cursor=db.rawQuery("SELECT name,version FROM retained WHERE name LIKE 'meta:%'",null)) {
            while (cursor.moveToNext()) {
                Object raw=value(db,cursor.getString(0)); if (!(raw instanceof JSONObject)) continue;
                JSONObject state=(JSONObject)raw;
                if (!state.isNull("leaseOwner")) {
                    state.put("leaseOwner",JSONObject.NULL).put("leaseUntil",0);
                    write(db,cursor.getString(0),state,cursor.getLong(1)+1);
                }
            }
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
    }
    static final class Conflict extends Exception { Conflict() { super("Phone data changed. Reopen the app before retrying."); } }
    Object retained(String key) throws Exception { return value(getReadableDatabase(),key); }
    void retain(String key,Object value) {
        SQLiteDatabase db=getWritableDatabase(); db.beginTransaction();
        try { write(db,key,value,version(db,key)+1); db.setTransactionSuccessful(); } finally { db.endTransaction(); }
    }
    JSONArray pendingBackground(String account) throws Exception {
        account(account); SQLiteDatabase db=getReadableDatabase(); java.util.List<JSONObject> pages=new java.util.ArrayList<>();
        try (Cursor cursor=db.rawQuery("SELECT name FROM retained WHERE name LIKE ?",new String[]{"inbox:"+account+":%"})) {
            while (cursor.moveToNext()) {
                JSONObject row=(JSONObject)value(db,cursor.getString(0));
                pages.add(new JSONObject().put("id",row.getString("id")).put("job",row.getJSONObject("job")).put("fetchedAt",row.getLong("fetchedAt")));
            }
        }
        pages.sort(java.util.Comparator.comparingLong(row -> row.optLong("fetchedAt")));
        return new JSONArray(pages);
    }
    JSONObject backgroundRead(String account,String id,String url) throws Exception {
        account(account); if (!id.matches("[a-f0-9-]{36}")) throw new IllegalArgumentException("Invalid background page.");
        JSONObject page=(JSONObject)retained("inbox:"+account+":"+id);
        if (!url.equals(page.getString("url"))) throw new IllegalArgumentException("Background request does not match its source page.");
        JSONObject response=page.getJSONObject("response");
        if(response.has("gzipBody")) {
            byte[] compressed=android.util.Base64.decode(response.getString("gzipBody"),android.util.Base64.NO_WRAP);
            try(java.util.zip.GZIPInputStream input=new java.util.zip.GZIPInputStream(new java.io.ByteArrayInputStream(compressed))) {
                response.put("body",AmazonSession.read(input,16*1024*1024)); response.remove("gzipBody");
            }
        }
        return response;
    }
    void saveBackground(String account,JSONObject plan,JSONObject page) throws Exception {
        account(account); SQLiteDatabase db=getWritableDatabase(); db.beginTransaction();
        try {
            if (page!=null) {
                JSONObject response=page.getJSONObject("response");
                java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream();
                try(java.util.zip.GZIPOutputStream gzip=new java.util.zip.GZIPOutputStream(bytes)) { gzip.write(response.getString("body").getBytes(java.nio.charset.StandardCharsets.UTF_8)); }
                response.remove("body"); response.put("gzipBody",android.util.Base64.encodeToString(bytes.toByteArray(),android.util.Base64.NO_WRAP));
                write(db,"inbox:"+account+":"+page.getString("id"),page,1);
            }
            String key="background-plan:"+account; write(db,key,plan,version(db,key)+1);
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
    }
}
