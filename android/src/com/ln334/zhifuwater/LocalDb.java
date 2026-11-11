package com.ln334.zhifuwater;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

/**
 * 本机模式的 SQLite 存储（表结构与服务器快照字段对齐）。
 *
 * <p>首次打开时从 assets/demo/*.json 导入初始快照，并把快照里的时间整体平移到“现在”，
 * 这样离线数据看起来不是很久以前的死数据。之后引擎与本地 API 全部读写这个库。</p>
 */
public final class LocalDb extends SQLiteOpenHelper {

    private static final String TAG = "LocalDb";
    private static final String DB_NAME = "zhifu_local.db";
    private static final int DB_VERSION = 3;

    private static volatile LocalDb instance;

    public static LocalDb get(Context ctx) {
        if (instance == null) {
            synchronized (LocalDb.class) {
                if (instance == null) instance = new LocalDb(ctx.getApplicationContext());
            }
        }
        return instance;
    }

    private final Context app;

    private LocalDb(Context app) {
        super(app, DB_NAME, null, DB_VERSION);
        this.app = app;
    }

    // ======================= 表结构 =======================

    private static final String[] TABLES = {
            "meta", "sites", "points", "telemetry", "alarms", "alarm_rules",
            "workorders", "inspections", "inspection_items", "notifications",
            "devices", "lab"
    };

    /**
     * 建表 SQL（每条都是单行，方便 cat 出来做静态核对）。
     * 主键：meta.key / sites.id / points.point_id / alarms.id / workorders.id / inspections.id
     */
    static final String[] SCHEMA = {
            "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS sites (id TEXT PRIMARY KEY, name TEXT, short_name TEXT, region TEXT, area TEXT, process TEXT, capacity TEXT, status TEXT, device_ref TEXT, updated_at TEXT, raw TEXT)",
            "CREATE TABLE IF NOT EXISTS points (point_id TEXT PRIMARY KEY, site_id TEXT, device_id TEXT, unit_code TEXT, code TEXT, name TEXT, unit TEXT, type TEXT, value REAL, quality TEXT, source TEXT, provenance TEXT, writable TEXT, updated_at TEXT, raw TEXT)",
            "CREATE TABLE IF NOT EXISTS telemetry (id INTEGER PRIMARY KEY AUTOINCREMENT, point_id TEXT NOT NULL, code TEXT, site_id TEXT, bucket INTEGER NOT NULL, at TEXT, value REAL, quality TEXT, UNIQUE(point_id, bucket))",
            "CREATE TABLE IF NOT EXISTS alarms (id TEXT PRIMARY KEY, site_id TEXT, point_id TEXT, point_code TEXT, unit_code TEXT, level TEXT, title TEXT, detail TEXT, status TEXT, value REAL, threshold TEXT, rule_id TEXT, first_at TEXT, last_at TEXT, ack_at TEXT, ack_by TEXT, resolved_at TEXT, resolved_by TEXT, count INTEGER, source TEXT, raw TEXT)",
            "CREATE TABLE IF NOT EXISTS alarm_rules (id TEXT PRIMARY KEY, site_id TEXT, point_code TEXT, op TEXT, threshold REAL, level TEXT, title TEXT, detail TEXT, continuity_ms INTEGER, threshold_text TEXT, seq INTEGER)",
            "CREATE TABLE IF NOT EXISTS workorders (id TEXT PRIMARY KEY, site_id TEXT, title TEXT, type TEXT, priority TEXT, status TEXT, source TEXT, alarm_id TEXT, unit_code TEXT, device_id TEXT, assignee_id TEXT, creator_id TEXT, created_at TEXT, due_at TEXT, accepted_at TEXT, started_at TEXT, finished_at TEXT, verified_at TEXT, description TEXT, result TEXT, sla_hours INTEGER, raw TEXT)",
            "CREATE TABLE IF NOT EXISTS inspections (id TEXT PRIMARY KEY, site_id TEXT, plan_id TEXT, title TEXT, type TEXT, due_at TEXT, assignee_id TEXT, status TEXT, created_at TEXT, done_at TEXT, done_by TEXT, summary TEXT, raw TEXT)",
            "CREATE TABLE IF NOT EXISTS inspection_items (inspection_id TEXT NOT NULL, item_key TEXT NOT NULL, seq INTEGER, label TEXT, standard TEXT, result TEXT, note TEXT, PRIMARY KEY(inspection_id, item_key))",
            "CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, level TEXT, title TEXT, body TEXT, created_at TEXT, read INTEGER DEFAULT 0, ref_id TEXT)",
            "CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, site_id TEXT, unit_code TEXT, code TEXT, name TEXT, type TEXT, status TEXT, online INTEGER, runtime_hours REAL, starts INTEGER, maint_cycle_days INTEGER, last_maint_at TEXT, warranty_until TEXT, install_date TEXT, health INTEGER, raw TEXT)",
            "CREATE TABLE IF NOT EXISTS lab (id TEXT PRIMARY KEY, site_id TEXT, sample_point TEXT, sample_point_name TEXT, sampled_at TEXT, recorded_at TEXT, operator_id TEXT, operator_name TEXT, status TEXT, reviewed_at TEXT, reviewer_name TEXT, cod REAL, nh3n REAL, tn REAL, tp REAL, ss REAL, raw TEXT)",
            "CREATE INDEX IF NOT EXISTS idx_alarms_status ON alarms(site_id, status)",
            "CREATE INDEX IF NOT EXISTS idx_workorders_status ON workorders(site_id, status)",
            "CREATE INDEX IF NOT EXISTS idx_inspections_status ON inspections(site_id, status)",
            "CREATE INDEX IF NOT EXISTS idx_telemetry_code ON telemetry(code, bucket)",
            "CREATE INDEX IF NOT EXISTS idx_notifications_at ON notifications(created_at)",
            "CREATE INDEX IF NOT EXISTS idx_devices_unit ON devices(site_id, unit_code)",
            "CREATE INDEX IF NOT EXISTS idx_lab_time ON lab(site_id, sampled_at)"
    };

    @Override
    public void onCreate(SQLiteDatabase db) {
        for (String sql : SCHEMA) db.execSQL(sql);
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        for (String t : TABLES) db.execSQL("DROP TABLE IF EXISTS " + t);
        onCreate(db);
        seedIfNeeded(db);
    }

    /** 打开数据库并保证种子数据已导入。 */
    public SQLiteDatabase db() {
        SQLiteDatabase d = getWritableDatabase();
        seedIfNeeded(d);
        return d;
    }

    // ======================= 首次导入 =======================

    private synchronized void seedIfNeeded(SQLiteDatabase db) {
        if ("1".equals(metaString(db, "seed_done"))) return;
        try {
            JSONArray sites = dataArray(assetJson("sites.json"));
            JSONObject me = assetJson("me.json").optJSONObject("data");
            JSONObject ov = assetJson("overview-site-1.json").optJSONObject("data");
            if (sites == null || ov == null) {
                Log.w(TAG, "assets/demo 快照缺失，跳过本机种子导入");
                return;
            }
            JSONArray alarms = dataArray(assetJson("alarms-open.json"));
            JSONArray woOpen = dataArray(assetJson("workorders-open.json"));
            JSONArray woDone = dataArray(assetJson("workorders-done.json"));
            JSONArray inspections = dataArray(assetJson("inspections.json"));
            JSONObject detail = assetJson("inspection-detail.json").optJSONObject("data");

            long ref = LocalCore.parseIso(ov.optString("generatedAt"));
            long now = System.currentTimeMillis();
            long delta = ref > 0 ? now - ref : 0L;
            if (delta < 0) delta = 0L;
            delta = LocalCore.alignBucket(delta);

            db.beginTransaction();
            try {
                String nowIso = LocalCore.iso(now);
                for (int i = 0; i < sites.length(); i++) {
                    insertSite(db, sites.optJSONObject(i), nowIso);
                }
                JSONArray units = ov.optJSONArray("process");
                if (units != null) {
                    for (int i = 0; i < units.length(); i++) {
                        JSONObject unit = units.optJSONObject(i);
                        if (unit == null) continue;
                        String unitCode = unit.optString("code");
                        JSONArray readings = unit.optJSONArray("readings");
                        if (readings == null) continue;
                        for (int j = 0; j < readings.length(); j++) {
                            insertPoint(db, "site-1", unitCode, readings.optJSONObject(j), delta);
                        }
                    }
                }
                insertExtraPoints(db, delta);
                importTrends(db, ov, delta);
                importAlarms(db, alarms, delta);
                importWorkorders(db, woOpen, delta);
                importWorkorders(db, woDone, delta);
                importInspections(db, inspections, detail, delta);
                importRules(db);
                importDevices(db, delta);
                importLab(db, delta);
                importMe(db, me, delta);
                importOverviewSeed(db, ov, delta);
                importCounters(db, ov, delta, now);
                putMeta(db, "seed_done", "1");
                putMeta(db, "seed_delta_ms", String.valueOf(delta));
                putMeta(db, "last_tick", String.valueOf(now));
                putMeta(db, "alarm_seq", "10");
                putMeta(db, "wo_seq", "10");
                db.setTransactionSuccessful();
            } catch (RuntimeException e) {
                Log.e(TAG, "种子导入失败", e);
            } finally {
                db.endTransaction();
            }
        } catch (IOException e) {
            Log.w(TAG, "读取 assets/demo 失败：" + e.getMessage());
        } catch (JSONException e) {
            Log.e(TAG, "解析 assets/demo 失败", e);
        }
    }

    private JSONObject assetJson(String name) throws IOException, JSONException {
        InputStream in = app.getAssets().open("demo/" + name);
        StringBuilder sb = new StringBuilder();
        BufferedReader reader = null;
        try {
            reader = new BufferedReader(new InputStreamReader(in, "UTF-8"));
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append('\n');
            }
        } finally {
            closeQuietly(reader);
            closeQuietly(in);
        }
        return (JSONObject) Json.denull(new JSONObject(sb.toString()));
    }

    private static JSONArray dataArray(JSONObject root) {
        return root == null ? null : root.optJSONArray("data");
    }

    private void insertSite(SQLiteDatabase db, JSONObject s, String nowIso) {
        if (s == null) return;
        ContentValues v = new ContentValues();
        v.put("id", s.optString("id"));
        v.put("name", s.optString("name"));
        v.put("short_name", s.optString("shortName"));
        v.put("region", s.optString("region"));
        v.put("area", s.optString("area"));
        v.put("process", s.optString("process"));
        v.put("capacity", s.optString("capacity"));
        v.put("status", s.optString("status", "online"));
        v.put("device_ref", s.optString("deviceRef"));
        v.put("updated_at", nowIso);
        v.put("raw", s.toString());
        db.insertWithOnConflict("sites", null, v, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private void insertPoint(SQLiteDatabase db, String siteId, String unitCode, JSONObject r, long delta) {
        if (r == null) return;
        String code = r.optString("code");
        if (LocalCore.isBlank(code)) return;
        ContentValues v = new ContentValues();
        v.put("point_id", r.optString("pointId", code));
        v.put("site_id", siteId);
        v.put("device_id", r.optString("deviceId"));
        v.put("unit_code", unitCode);
        v.put("code", code);
        v.put("name", r.optString("name", code));
        v.put("unit", r.optString("unit"));
        v.put("type", r.optString("type", "measure"));
        v.put("value", r.optDouble("v", r.optDouble("value", 0)));
        v.put("quality", r.optString("quality", "good"));
        v.put("source", r.optString("source", "gateway"));
        v.put("provenance", r.optString("provenance", "local"));
        v.put("writable", r.optString("writable", "read"));
        v.put("updated_at", LocalCore.shiftIso(r.optString("t"), delta));
        JSONObject raw = copy(r);
        try {
            raw.put("t", LocalCore.shiftIso(r.optString("t"), delta));
        } catch (JSONException e) {
            Log.w(TAG, "点位时间平移失败：" + code);
        }
        v.put("raw", raw.toString());
        db.insertWithOnConflict("points", null, v, SQLiteDatabase.CONFLICT_REPLACE);
    }

    /** 补充几个累计量点位（电量/药耗/运行时长），种子快照里没有。 */
    private void insertExtraPoints(SQLiteDatabase db, long delta) {
        String t = LocalCore.iso(System.currentTimeMillis());
        addExtraPoint(db, "site-1", "pac", "PAC.USED.L", "PAC 累计药耗", "L", "counter",
                "dev-site-1-pac-pump", 0.9, t);
        addExtraPoint(db, "site-1", "pam", "PAM.USED.L", "PAM 累计药耗", "L", "counter",
                "dev-site-1-pam-pump", 0.3, t);
        addExtraPoint(db, "site-1", "raw", "RAW.PUMP.H", "提升泵累计运行", "h", "counter",
                "dev-site-1-raw-pump", 128.0, t);
        addExtraPoint(db, "site-1", "baf", "BAF.BLOWER.H", "曝气风机累计运行", "h", "counter",
                "dev-site-1-baf-blower", 342.0, t);
    }

    private void addExtraPoint(SQLiteDatabase db, String siteId, String unitCode, String code,
                               String name, String unit, String type, String deviceId,
                               double value, String at) {
        JSONObject r = new JSONObject();
        try {
            r.put("pointId", "pt-" + siteId + "-" + code.toLowerCase().replace('.', '-'));
            r.put("code", code);
            r.put("name", name);
            r.put("unit", unit);
            r.put("unitCode", unitCode);
            r.put("deviceId", deviceId);
            r.put("type", type);
            r.put("value", value);
            r.put("v", value);
            r.put("t", at);
            r.put("quality", "good");
            r.put("q", "good");
            r.put("source", "gateway");
            r.put("provenance", "local");
            r.put("writable", "read");
            r.put("stale", false);
        } catch (JSONException e) {
            Log.w(TAG, "构造累计量点位失败：" + code);
        }
        insertPoint(db, siteId, unitCode, r, 0L);
    }

    private void importTrends(SQLiteDatabase db, JSONObject ov, long delta) {
        JSONObject trends = ov.optJSONObject("trends");
        if (trends == null) return;
        java.util.Iterator<String> it = trends.keys();
        while (it.hasNext()) {
            String code = it.next();
            JSONObject trend = trends.optJSONObject(code);
            if (trend == null) continue;
            JSONArray points = trend.optJSONArray("points");
            if (points == null) continue;
            int n = points.length();
            for (int i = 0; i < n; i++) {
                JSONObject p = points.optJSONObject(i);
                if (p == null) continue;
                long t = p.optLong("t", 0L) + delta;
                ContentValues v = new ContentValues();
                v.put("point_id", code);
                v.put("code", code);
                v.put("site_id", "site-1");
                v.put("bucket", LocalCore.alignBucket(t));
                v.put("at", LocalCore.iso(t));
                v.put("value", p.optDouble("v", 0));
                v.put("quality", p.optString("q", "good"));
                db.insertWithOnConflict("telemetry", null, v, SQLiteDatabase.CONFLICT_REPLACE);
            }
        }
    }

    private void importAlarms(SQLiteDatabase db, JSONArray alarms, long delta) {
        if (alarms == null) return;
        for (int i = 0; i < alarms.length(); i++) {
            JSONObject a = shiftTimes(alarms.optJSONObject(i), delta);
            if (a == null) continue;
            ContentValues v = new ContentValues();
            v.put("id", a.optString("id"));
            v.put("site_id", a.optString("siteId", "site-1"));
            v.put("point_id", a.optString("pointId"));
            v.put("point_code", a.optString("pointCode"));
            v.put("unit_code", a.optString("unitCode"));
            v.put("level", a.optString("level", "minor"));
            v.put("title", a.optString("title"));
            v.put("detail", a.optString("detail"));
            v.put("status", a.optString("status", "active"));
            v.put("value", a.optDouble("value", 0));
            v.put("threshold", a.optString("threshold"));
            v.put("rule_id", a.optString("ruleId"));
            v.put("first_at", a.optString("firstAt", a.optString("lastAt")));
            v.put("last_at", a.optString("lastAt"));
            v.put("ack_at", a.optString("ackAt", ""));
            v.put("ack_by", a.optString("ackBy", ""));
            v.put("resolved_at", a.optString("resolvedAt", ""));
            v.put("resolved_by", a.optString("resolvedBy", ""));
            v.put("count", a.optInt("count", 1));
            v.put("source", a.optString("source", "rule"));
            v.put("raw", a.toString());
            db.insertWithOnConflict("alarms", null, v, SQLiteDatabase.CONFLICT_REPLACE);
        }
    }


    private JSONObject assetJsonQuiet(String name) {
        try {
            return assetJson(name);
        } catch (Exception e) {
            Log.w(TAG, "缺少演示快照 " + name + "：" + e.getMessage());
            return null;
        }
    }

    private void importDevices(SQLiteDatabase db, long delta) {
        JSONArray list = dataArray(assetJsonQuiet("devices.json"));
        if (list == null) return;
        for (int i = 0; i < list.length(); i++) {
            JSONObject d = list.optJSONObject(i);
            if (d == null) continue;
            JSONObject health = d.optJSONObject("health");
            ContentValues v = new ContentValues();
            v.put("id", d.optString("id"));
            v.put("site_id", d.optString("siteId", "site-1"));
            v.put("unit_code", d.optString("unitCode"));
            v.put("code", d.optString("code"));
            v.put("name", d.optString("name"));
            v.put("type", d.optString("type"));
            v.put("status", d.optString("status"));
            v.put("online", d.optBoolean("online", true) ? 1 : 0);
            v.put("runtime_hours", d.optDouble("runtimeHours", 0));
            v.put("starts", d.optInt("starts", 0));
            v.put("maint_cycle_days", d.optInt("maintCycleDays", 0));
            v.put("last_maint_at", LocalCore.shiftIso(d.optString("lastMaintAt"), delta));
            v.put("warranty_until", d.optString("warrantyUntil"));
            v.put("install_date", d.optString("installDate"));
            v.put("health", health == null ? 100 : health.optInt("score", 100));
            v.put("raw", d.toString());
            db.insertWithOnConflict("devices", null, v, SQLiteDatabase.CONFLICT_REPLACE);
        }
    }

    private void importLab(SQLiteDatabase db, long delta) {
        JSONArray list = dataArray(assetJsonQuiet("lab.json"));
        if (list == null) return;
        for (int i = 0; i < list.length(); i++) {
            JSONObject r = list.optJSONObject(i);
            if (r == null) continue;
            JSONObject m = r.optJSONObject("metrics");
            ContentValues v = new ContentValues();
            v.put("id", r.optString("id"));
            v.put("site_id", r.optString("siteId", "site-1"));
            v.put("sample_point", r.optString("samplePoint"));
            v.put("sample_point_name", r.optString("samplePointName"));
            v.put("sampled_at", LocalCore.shiftIso(r.optString("sampledAt"), delta));
            v.put("recorded_at", LocalCore.shiftIso(r.optString("recordedAt"), delta));
            v.put("operator_id", r.optString("operatorId"));
            v.put("operator_name", r.optString("operatorName"));
            v.put("status", r.optString("status", "pending_review"));
            v.put("reviewed_at", r.optString("reviewedAt", ""));
            v.put("reviewer_name", r.optString("reviewerName", ""));
            v.put("cod", m == null ? null : m.optDouble("COD"));
            v.put("nh3n", m == null ? null : m.optDouble("NH3N"));
            v.put("tn", m == null ? null : m.optDouble("TN"));
            v.put("tp", m == null ? null : m.optDouble("TP"));
            v.put("ss", m == null ? null : m.optDouble("SS"));
            v.put("raw", r.toString());
            db.insertWithOnConflict("lab", null, v, SQLiteDatabase.CONFLICT_REPLACE);
        }
    }

    private void importWorkorders(SQLiteDatabase db, JSONArray list, long delta) {
        if (list == null) return;
        for (int i = 0; i < list.length(); i++) {
            JSONObject w = shiftTimes(list.optJSONObject(i), delta);
            if (w == null) continue;
            ContentValues v = new ContentValues();
            v.put("id", w.optString("id"));
            v.put("site_id", w.optString("siteId", "site-1"));
            v.put("title", w.optString("title"));
            v.put("type", w.optString("type"));
            v.put("priority", w.optString("priority", "normal"));
            v.put("status", w.optString("status", "pending"));
            v.put("source", w.optString("source"));
            v.put("alarm_id", w.optString("alarmId"));
            v.put("unit_code", w.optString("unitCode"));
            v.put("device_id", w.optString("deviceId"));
            v.put("assignee_id", w.optString("assigneeId"));
            v.put("creator_id", w.optString("creatorId"));
            v.put("created_at", w.optString("createdAt"));
            v.put("due_at", w.optString("dueAt"));
            v.put("accepted_at", w.optString("acceptedAt", ""));
            v.put("started_at", w.optString("startedAt", ""));
            v.put("finished_at", w.optString("finishedAt", ""));
            v.put("verified_at", w.optString("verifiedAt", ""));
            v.put("description", w.optString("description"));
            v.put("result", w.optString("result"));
            v.put("sla_hours", w.optInt("slaHours", 0));
            v.put("raw", w.toString());
            db.insertWithOnConflict("workorders", null, v, SQLiteDatabase.CONFLICT_REPLACE);
        }
    }

    private void importInspections(SQLiteDatabase db, JSONArray list, JSONObject detail, long delta) {
        if (list == null) return;
        for (int i = 0; i < list.length(); i++) {
            JSONObject ins = shiftTimes(list.optJSONObject(i), delta);
            if (ins == null) continue;
            String id = ins.optString("id");
            JSONObject full = ins;
            if (detail != null && id.equals(detail.optString("id"))) {
                full = shiftTimes(detail, delta);
                if (full == null) full = ins;
            }
            ContentValues v = new ContentValues();
            v.put("id", id);
            v.put("site_id", full.optString("siteId", "site-1"));
            v.put("plan_id", full.optString("planId"));
            v.put("title", full.optString("title"));
            v.put("type", full.optString("type", "daily"));
            v.put("due_at", full.optString("dueAt"));
            v.put("assignee_id", full.optString("assigneeId"));
            v.put("status", full.optString("status", "pending"));
            v.put("created_at", full.optString("createdAt"));
            v.put("done_at", full.optString("doneAt", ""));
            v.put("done_by", full.optString("doneBy", ""));
            v.put("summary", full.optString("summary", ""));
            v.put("raw", full.toString());
            db.insertWithOnConflict("inspections", null, v, SQLiteDatabase.CONFLICT_REPLACE);
            JSONArray items = full.optJSONArray("items");
            if (items != null) {
                for (int j = 0; j < items.length(); j++) {
                    JSONObject item = items.optJSONObject(j);
                    if (item == null) continue;
                    ContentValues iv = new ContentValues();
                    iv.put("inspection_id", id);
                    iv.put("item_key", item.optString("key", "i" + (j + 1)));
                    iv.put("seq", j);
                    iv.put("label", item.optString("label"));
                    iv.put("standard", item.optString("standard"));
                    iv.put("result", item.optString("result", ""));
                    iv.put("note", item.optString("note", ""));
                    db.insertWithOnConflict("inspection_items", null, iv, SQLiteDatabase.CONFLICT_REPLACE);
                }
            }
        }
    }

    private void importRules(SQLiteDatabase db) {
        LocalCore.RuleSpec[] rules = LocalCore.rules();
        for (int i = 0; i < rules.length; i++) {
            LocalCore.RuleSpec r = rules[i];
            ContentValues v = new ContentValues();
            v.put("id", r.id);
            v.put("site_id", "site-1");
            v.put("point_code", r.pointCode);
            v.put("op", r.op);
            v.put("threshold", r.threshold);
            v.put("level", r.level);
            v.put("title", r.title);
            v.put("detail", r.detail);
            v.put("continuity_ms", r.continuityMs);
            v.put("threshold_text", r.thresholdText);
            v.put("seq", i);
            db.insertWithOnConflict("alarm_rules", null, v, SQLiteDatabase.CONFLICT_REPLACE);
        }
    }

    private void importMe(SQLiteDatabase db, JSONObject me, long delta) {
        if (me == null) return;
        putMeta(db, "me", shiftTimes(me, delta).toString());
    }

    private void importOverviewSeed(SQLiteDatabase db, JSONObject ov, long delta) {
        JSONObject seed = shiftTimes(ov, delta);
        if (seed != null) putMeta(db, "overview_seed", seed.toString());
    }

    private void importCounters(SQLiteDatabase db, JSONObject ov, long delta, long now) {
        JSONObject res = ov.optJSONObject("resources");
        double energyToday = res == null ? 19.7 : res.optDouble("energyTodayKwh", 19.7);
        double pacToday = res == null ? 0.9 : res.optDouble("pacTodayL", 0.9);
        double pamToday = res == null ? 0.3 : res.optDouble("pamTodayL", 0.3);
        double volume = 1.425;
        JSONArray kpis = ov.optJSONArray("kpis");
        if (kpis != null) {
            for (int i = 0; i < kpis.length(); i++) {
                JSONObject k = kpis.optJSONObject(i);
                if (k != null && "volume".equals(k.optString("key"))) {
                    volume = k.optDouble("value", volume);
                }
            }
        }
        putMeta(db, "energy_today_kwh", String.valueOf(energyToday));
        putMeta(db, "pac_today_l", String.valueOf(pacToday));
        putMeta(db, "pam_today_l", String.valueOf(pamToday));
        putMeta(db, "volume_today_m3", String.valueOf(volume));
        putMeta(db, "day_key", LocalCore.dayKey(now));
    }

    // ======================= meta =======================

    public String metaString(SQLiteDatabase db, String key) {
        Cursor c = null;
        try {
            c = db.rawQuery("SELECT value FROM meta WHERE key = ?", new String[]{key});
            return c.moveToFirst() ? c.getString(0) : null;
        } catch (Exception e) {
            return null;
        } finally {
            closeQuietly(c);
        }
    }

    public double metaDouble(SQLiteDatabase db, String key, double def) {
        String v = metaString(db, key);
        if (LocalCore.isBlank(v)) return def;
        try {
            return Double.parseDouble(v);
        } catch (NumberFormatException e) {
            return def;
        }
    }

    public long metaLong(SQLiteDatabase db, String key, long def) {
        String v = metaString(db, key);
        if (LocalCore.isBlank(v)) return def;
        try {
            return Long.parseLong(v.trim());
        } catch (NumberFormatException e) {
            return def;
        }
    }

    public JSONObject metaJson(SQLiteDatabase db, String key) {
        String v = metaString(db, key);
        if (LocalCore.isBlank(v)) return null;
        try {
            return new JSONObject(v);
        } catch (JSONException e) {
            return null;
        }
    }

    public void putMeta(SQLiteDatabase db, String key, String value) {
        ContentValues v = new ContentValues();
        v.put("key", key);
        v.put("value", value == null ? "" : value);
        db.insertWithOnConflict("meta", null, v, SQLiteDatabase.CONFLICT_REPLACE);
    }

    public int nextSeq(SQLiteDatabase db, String key) {
        int seq = (int) metaLong(db, key, 10);
        putMeta(db, key, String.valueOf(seq + 1));
        return seq;
    }

    // ======================= 站点 =======================

    public JSONArray sites() {
        SQLiteDatabase db = db();
        Cursor c = null;
        JSONArray out = new JSONArray();
        try {
            c = db.rawQuery("SELECT raw FROM sites ORDER BY rowid", null);
            while (c.moveToNext()) {
                JSONObject o = json(c.getString(0));
                if (o != null) out.put(o);
            }
        } catch (Exception e) {
            Log.w(TAG, "读取站点失败：" + e.getMessage());
        } finally {
            closeQuietly(c);
        }
        return out;
    }

    public JSONObject site(String siteId) {
        SQLiteDatabase db = db();
        Cursor c = null;
        try {
            c = db.rawQuery("SELECT raw FROM sites WHERE id = ?", new String[]{siteId});
            if (c.moveToFirst()) return json(c.getString(0));
        } catch (Exception e) {
            Log.w(TAG, "读取站点失败：" + e.getMessage());
        } finally {
            closeQuietly(c);
        }
        return null;
    }

    // ======================= 点位 / 遥测 =======================

    /** code → 点位 JSON（含当前值）。 */
    public JSONObject points(String siteId) {
        SQLiteDatabase db = db();
        Cursor c = null;
        JSONObject out = new JSONObject();
        try {
            c = db.rawQuery("SELECT code, value, quality, updated_at, raw, unit_code, type FROM points WHERE site_id = ? ORDER BY rowid",
                    new String[]{siteId});
            while (c.moveToNext()) {
                JSONObject o = json(c.getString(4));
                if (o == null) o = new JSONObject();
                String code = c.getString(0);
                o.put("code", code);
                o.put("value", c.getDouble(1));
                o.put("v", c.getDouble(1));
                o.put("quality", c.getString(2));
                o.put("q", c.getString(2));
                o.put("t", c.getString(3));
                o.put("unitCode", c.getString(5));
                o.put("type", c.getString(6));
                o.put("stale", false);
                out.put(code, o);
            }
        } catch (Exception e) {
            Log.w(TAG, "读取点位失败：" + e.getMessage());
        } finally {
            closeQuietly(c);
        }
        return out;
    }

    /** 只取点位数值：code → value（引擎每 5 秒用一次）。 */
    public JSONObject pointValues(String siteId) {
        SQLiteDatabase db = db();
        Cursor c = null;
        JSONObject out = new JSONObject();
        try {
            c = db.rawQuery("SELECT code, value FROM points WHERE site_id = ?", new String[]{siteId});
            while (c.moveToNext()) {
                out.put(c.getString(0), c.getDouble(1));
            }
        } catch (Exception e) {
            Log.w(TAG, "读取点位数值失败：" + e.getMessage());
        } finally {
            closeQuietly(c);
        }
        return out;
    }

    public void writePoint(String code, double value, String atIso) {
        SQLiteDatabase db = db();
        ContentValues v = new ContentValues();
        v.put("value", value);
        v.put("updated_at", atIso);
        v.put("quality", "good");
        db.update("points", v, "code = ?", new String[]{code});
        // 同步 raw 里的 value/t，保证页面读到的时点一致
        Cursor c = null;
        try {
            c = db.rawQuery("SELECT raw FROM points WHERE code = ?", new String[]{code});
            if (c.moveToFirst()) {
                JSONObject raw = json(c.getString(0));
                if (raw != null) {
                    raw.put("value", value);
                    raw.put("v", value);
                    raw.put("t", atIso);
                    raw.put("stale", false);
                    ContentValues rv = new ContentValues();
                    rv.put("raw", raw.toString());
                    db.update("points", rv, "code = ?", new String[]{code});
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "更新点位 raw 失败：" + e.getMessage());
        } finally {
            closeQuietly(c);
        }
    }

    public void appendTelemetry(String siteId, String code, long atMs, double value, String quality) {
        SQLiteDatabase db = db();
        ContentValues v = new ContentValues();
        v.put("point_id", code);
        v.put("code", code);
        v.put("site_id", siteId);
        v.put("bucket", LocalCore.alignBucket(atMs));
        v.put("at", LocalCore.iso(atMs));
        v.put("value", value);
        v.put("quality", quality);
        db.insertWithOnConflict("telemetry", null, v, SQLiteDatabase.CONFLICT_REPLACE);
    }

    public JSONArray telemetry(String code, int limit) {
        SQLiteDatabase db = db();
        Cursor c = null;
        JSONArray out = new JSONArray();
        try {
            c = db.rawQuery("SELECT bucket, at, value, quality FROM telemetry WHERE code = ? ORDER BY bucket DESC LIMIT ?",
                    new String[]{code, String.valueOf(limit)});
            List<JSONObject> rows = new ArrayList<JSONObject>();
            while (c.moveToNext()) {
                JSONObject p = new JSONObject();
                p.put("t", c.getLong(0));
                p.put("at", c.getString(1));
                p.put("v", c.getDouble(2));
                p.put("q", c.getString(3));
                rows.add(0, p);
            }
            for (JSONObject p : rows) out.put(p);
        } catch (Exception e) {
            Log.w(TAG, "读取遥测失败：" + e.getMessage());
        } finally {
            closeQuietly(c);
        }
        return out;
    }


    // ======================= 设备 / 化验 =======================

    public JSONArray deviceList(String siteId) {
        Cursor c = null;
        JSONArray out = new JSONArray();
        try {
            c = db().rawQuery("SELECT id, unit_code, code, name, type, status, online, runtime_hours, starts, maint_cycle_days, last_maint_at, warranty_until, install_date, health, raw FROM devices WHERE site_id = ? ORDER BY code",
                    new String[]{siteId});
            while (c.moveToNext()) {
                JSONObject o = json(c.getString(14));
                if (o == null) o = new JSONObject();
                o.put("id", c.getString(0));
                o.put("unitCode", c.getString(1));
                o.put("code", c.getString(2));
                o.put("name", c.getString(3));
                o.put("type", c.getString(4));
                o.put("status", c.getString(5));
                o.put("online", c.getInt(6) == 1);
                o.put("runtimeHours", c.getDouble(7));
                o.put("starts", c.getInt(8));
                o.put("maintCycleDays", c.getInt(9));
                o.put("lastMaintAt", c.getString(10));
                o.put("warrantyUntil", c.getString(11));
                o.put("installDate", c.getString(12));
                o.put("health", c.getInt(13));
                out.put(o);
            }
        } catch (Exception e) {
            Log.w(TAG, "读取设备失败：" + e.getMessage());
        } finally {
            closeQuietly(c);
        }
        return out;
    }

    public JSONArray labList(String siteId, String status, int limit) {
        Cursor c = null;
        JSONArray out = new JSONArray();
        try {
            String sql = "SELECT raw, sampled_at, recorded_at, status, reviewer_name, reviewed_at, cod, nh3n, tn, tp, ss FROM lab WHERE site_id = ?";
            String[] args;
            if (status == null || status.length() == 0) {
                sql += " ORDER BY sampled_at DESC LIMIT ?";
                args = new String[]{siteId, String.valueOf(limit)};
            } else {
                sql += " AND status = ? ORDER BY sampled_at DESC LIMIT ?";
                args = new String[]{siteId, status, String.valueOf(limit)};
            }
            c = db().rawQuery(sql, args);
            while (c.moveToNext()) {
                JSONObject o = json(c.getString(0));
                if (o == null) o = new JSONObject();
                o.put("sampledAt", c.getString(1));
                o.put("recordedAt", c.getString(2));
                o.put("status", c.getString(3));
                o.put("reviewerName", c.getString(4));
                o.put("reviewedAt", c.getString(5));
                JSONObject m = new JSONObject();
                m.put("COD", c.isNull(6) ? JSONObject.NULL : c.getDouble(6));
                m.put("NH3N", c.isNull(7) ? JSONObject.NULL : c.getDouble(7));
                m.put("TN", c.isNull(8) ? JSONObject.NULL : c.getDouble(8));
                m.put("TP", c.isNull(9) ? JSONObject.NULL : c.getDouble(9));
                m.put("SS", c.isNull(10) ? JSONObject.NULL : c.getDouble(10));
                o.put("metrics", m);
                out.put(o);
            }
        } catch (Exception e) {
            Log.w(TAG, "读取化验记录失败：" + e.getMessage());
        } finally {
            closeQuietly(c);
        }
        return out;
    }

    public JSONObject labCounts(String siteId) {
        JSONObject out = new JSONObject();
        int total = 0, pending = 0;
        Cursor c = null;
        try {
            c = db().rawQuery("SELECT status, COUNT(*) FROM lab WHERE site_id = ? GROUP BY status", new String[]{siteId});
            while (c.moveToNext()) {
                int n = c.getInt(1);
                total += n;
                if ("pending_review".equals(c.getString(0))) pending += n;
            }
            out.put("total", total);
            out.put("pending", pending);
            out.put("reviewed", total - pending);
        } catch (Exception e) {
            Log.w(TAG, "统计化验记录失败：" + e.getMessage());
        } finally {
            closeQuietly(c);
        }
        return out;
    }

    public boolean reviewLab(String id, String reviewer) {
        ContentValues v = new ContentValues();
        v.put("status", "reviewed");
        v.put("reviewed_at", LocalCore.iso(System.currentTimeMillis()));
        v.put("reviewer_name", reviewer == null ? "" : reviewer);
        return db().update("lab", v, "id = ?", new String[]{id}) > 0;
    }

    /** 化验指标统计：进出口最新值、去除率、达标率。 */
    public JSONObject labStats(String siteId, int days) {
        final String[] metrics = {"COD", "NH3N", "TN", "TP", "SS"};
        final double[] limits = {50, 5, 15, 0.5, 10};
        final String[] names = {"COD", "氨氮", "总氮", "总磷", "悬浮物"};
        JSONObject out = new JSONObject();
        JSONArray rows = new JSONArray();
        long cutoff = System.currentTimeMillis() - Math.max(1, days) * 86400000L;
        try {
            JSONArray list = labList(siteId, null, 400);
            double[] inlet = new double[metrics.length];
            double[] outlet = new double[metrics.length];
            boolean[] hasInlet = new boolean[metrics.length];
            boolean[] hasOutlet = new boolean[metrics.length];
            int[] samples = new int[metrics.length];
            int[] exceed = new int[metrics.length];
            for (int i = 0; i < list.length(); i++) {
                JSONObject r = list.optJSONObject(i);
                if (r == null) continue;
                boolean isOutlet = "outlet".equals(r.optString("samplePoint"));
                JSONObject m = r.optJSONObject("metrics");
                if (m == null) continue;
                long t = LocalCore.parseIso(r.optString("sampledAt"));
                for (int k = 0; k < metrics.length; k++) {
                    if (!m.has(metrics[k]) || m.isNull(metrics[k])) continue;
                    double v = m.optDouble(metrics[k], 0);
                    if (!isOutlet) {
                        inlet[k] = v;
                        hasInlet[k] = true;
                    } else {
                        if (t >= cutoff) {
                            samples[k]++;
                            if (v > limits[k]) exceed[k]++;
                        }
                        if (!hasOutlet[k]) {
                            outlet[k] = v;
                            hasOutlet[k] = true;
                        }
                    }
                }
            }
            for (int k = 0; k < metrics.length; k++) {
                JSONObject row = new JSONObject();
                row.put("metric", metrics[k]);
                row.put("name", names[k]);
                row.put("limit", limits[k]);
                row.put("inlet", hasInlet[k] ? inlet[k] : JSONObject.NULL);
                row.put("outlet", hasOutlet[k] ? outlet[k] : JSONObject.NULL);
                double removal = !hasOutlet[k] ? -1
                        : (hasInlet[k] && inlet[k] > 0 ? (inlet[k] - outlet[k]) / inlet[k] : -1);
                row.put("removal", removal);
                row.put("samples", samples[k]);
                row.put("exceed", exceed[k]);
                row.put("rate", samples[k] == 0 ? -1 : (samples[k] - exceed[k]) * 100.0 / samples[k]);
                rows.put(row);
            }
            JSONObject counts = labCounts(siteId);
            out.put("days", days);
            out.put("total", counts.optInt("total"));
            out.put("pending", counts.optInt("pending"));
            out.put("reviewed", counts.optInt("reviewed"));
            out.put("metrics", rows);
        } catch (Exception e) {
            Log.w(TAG, "统计化验指标失败：" + e.getMessage());
        }
        return out;
    }

    /** 点位列表（保留顺序，字段与服务器一致），供监测页使用。 */
    public JSONArray pointList(String siteId) {
        Cursor c = null;
        JSONArray out = new JSONArray();
        try {
            c = db().rawQuery("SELECT raw, value, quality, updated_at, unit_code, code, name, unit, type FROM points WHERE site_id = ? ORDER BY rowid",
                    new String[]{siteId});
            while (c.moveToNext()) {
                JSONObject o = json(c.getString(0));
                if (o == null) o = new JSONObject();
                o.put("value", c.getDouble(1));
                o.put("v", c.getDouble(1));
                o.put("quality", c.getString(2));
                o.put("q", c.getString(2));
                o.put("t", c.getString(3));
                o.put("unitCode", c.getString(4));
                o.put("code", c.getString(5));
                o.put("name", c.getString(6));
                o.put("unit", c.getString(7));
                o.put("type", c.getString(8));
                out.put(o);
            }
        } catch (Exception e) {
            Log.w(TAG, "读取点位列表失败：" + e.getMessage());
        } finally {
            closeQuietly(c);
        }
        return out;
    }

    /** 单个点位的最新读数（诊断用）。 */
    public JSONObject pointReading(String siteId, String code) {
        Cursor c = null;
        try {
            c = db().rawQuery("SELECT raw, value, quality, updated_at, unit, name FROM points WHERE site_id = ? AND code = ? LIMIT 1",
                    new String[]{siteId, code});
            if (c.moveToNext()) {
                JSONObject o = json(c.getString(0));
                if (o == null) o = new JSONObject();
                o.put("code", code);
                o.put("value", c.getDouble(1));
                o.put("quality", c.getString(2));
                o.put("updatedAt", c.getString(3));
                o.put("unit", c.getString(4));
                o.put("name", c.getString(5));
                return o;
            }
        } catch (Exception e) {
            Log.w(TAG, "读取点位读数失败：" + e.getMessage());
        } finally {
            closeQuietly(c);
        }
        return null;
    }

    public int pointCount(String siteId) {
        Cursor c = null;
        try {
            c = db().rawQuery("SELECT COUNT(*) FROM points WHERE site_id = ?", new String[]{siteId});
            if (c.moveToNext()) return c.getInt(0);
        } catch (Exception e) {
            Log.w(TAG, "统计点位失败：" + e.getMessage());
        } finally {
            closeQuietly(c);
        }
        return 0;
    }

    // ======================= 告警 =======================

    public JSONArray alarms(String siteId, String status) {
        SQLiteDatabase db = db();
        Cursor c = null;
        JSONArray out = new JSONArray();
        try {
            if (status == null) {
                c = db.rawQuery("SELECT raw FROM alarms WHERE site_id = ? ORDER BY last_at DESC", new String[]{siteId});
            } else {
                c = db.rawQuery("SELECT raw FROM alarms WHERE site_id = ? AND status = ? ORDER BY last_at DESC",
                        new String[]{siteId, status});
            }
            while (c.moveToNext()) {
                JSONObject o = json(c.getString(0));
                if (o != null) out.put(o);
            }
        } catch (Exception e) {
            Log.w(TAG, "读取告警失败：" + e.getMessage());
        } finally {
            closeQuietly(c);
        }
        return out;
    }

    public JSONObject alarm(String id) {
        SQLiteDatabase db = db();
        Cursor c = null;
        try {
            c = db.rawQuery("SELECT raw FROM alarms WHERE id = ?", new String[]{id});
            if (c.moveToFirst()) return json(c.getString(0));
        } catch (Exception e) {
            Log.w(TAG, "读取告警失败：" + e.getMessage());
        } finally {
            closeQuietly(c);
        }
        return null;
    }

    public JSONObject openAlarmByPoint(String siteId, String pointCode) {
        SQLiteDatabase db = db();
        Cursor c = null;
        try {
            c = db.rawQuery("SELECT raw FROM alarms WHERE site_id = ? AND point_code = ? AND status IN ('active','acknowledged') ORDER BY last_at DESC LIMIT 1",
                    new String[]{siteId, pointCode});
            if (c.moveToFirst()) return json(c.getString(0));
        } catch (Exception e) {
            Log.w(TAG, "读取点位告警失败：" + e.getMessage());
        } finally {
            closeQuietly(c);
        }
        return null;
    }

    public void upsertAlarm(JSONObject a) {
        SQLiteDatabase db = db();
        ContentValues v = new ContentValues();
        v.put("id", a.optString("id"));
        v.put("site_id", a.optString("siteId", "site-1"));
        v.put("point_id", a.optString("pointId"));
        v.put("point_code", a.optString("pointCode"));
        v.put("unit_code", a.optString("unitCode"));
        v.put("level", a.optString("level", "minor"));
        v.put("title", a.optString("title"));
        v.put("detail", a.optString("detail"));
        v.put("status", a.optString("status", "active"));
        v.put("value", a.optDouble("value", 0));
        v.put("threshold", a.optString("threshold"));
        v.put("rule_id", a.optString("ruleId"));
        v.put("first_at", a.optString("firstAt"));
        v.put("last_at", a.optString("lastAt"));
        v.put("ack_at", a.optString("ackAt", ""));
        v.put("ack_by", a.optString("ackBy", ""));
        v.put("resolved_at", a.optString("resolvedAt", ""));
        v.put("resolved_by", a.optString("resolvedBy", ""));
        v.put("count", a.optInt("count", 1));
        v.put("source", a.optString("source", "rule"));
        v.put("raw", a.toString());
        db.insertWithOnConflict("alarms", null, v, SQLiteDatabase.CONFLICT_REPLACE);
    }

    /** 告警计数（页面 meta.counts 用）。 */
    public JSONObject alarmCounts(String siteId) {
        SQLiteDatabase db = db();
        Cursor c = null;
        JSONObject out = new JSONObject();
        int all = 0, active = 0, ack = 0, critical = 0, major = 0, minor = 0;
        try {
            c = db.rawQuery("SELECT status, level FROM alarms WHERE site_id = ?", new String[]{siteId});
            while (c.moveToNext()) {
                all++;
                String status = c.getString(0);
                String level = c.getString(1);
                if ("active".equals(status)) active++;
                if ("acknowledged".equals(status)) ack++;
                if (!"resolved".equals(status) && !"closed".equals(status)) {
                    if ("critical".equals(level)) critical++;
                    else if ("major".equals(level)) major++;
                    else if ("minor".equals(level)) minor++;
                }
            }
            out.put("all", all);
            out.put("active", active);
            out.put("acknowledged", ack);
            out.put("critical", critical);
            out.put("major", major);
            out.put("minor", minor);
            out.put("info", 0);
        } catch (Exception e) {
            Log.w(TAG, "统计告警失败：" + e.getMessage());
        } finally {
            closeQuietly(c);
        }
        return out;
    }

    // ======================= 工单 =======================

    public JSONArray workorders(String siteId, boolean doneGroup) {
        SQLiteDatabase db = db();
        Cursor c = null;
        JSONArray out = new JSONArray();
        try {
            String where = doneGroup
                    ? "site_id = ? AND status IN ('done','verified','closed')"
                    : "site_id = ? AND status IN ('pending','accepted','processing')";
            c = db.rawQuery("SELECT raw FROM workorders WHERE " + where + " ORDER BY created_at DESC",
                    new String[]{siteId});
            while (c.moveToNext()) {
                JSONObject o = json(c.getString(0));
                if (o != null) out.put(o);
            }
        } catch (Exception e) {
            Log.w(TAG, "读取工单失败：" + e.getMessage());
        } finally {
            closeQuietly(c);
        }
        return out;
    }

    public JSONObject workorder(String id) {
        SQLiteDatabase db = db();
        Cursor c = null;
        try {
            c = db.rawQuery("SELECT raw FROM workorders WHERE id = ?", new String[]{id});
            if (c.moveToFirst()) return json(c.getString(0));
        } catch (Exception e) {
            Log.w(TAG, "读取工单失败：" + e.getMessage());
        } finally {
            closeQuietly(c);
        }
        return null;
    }

    public void updateWorkorder(JSONObject w) {
        SQLiteDatabase db = db();
        ContentValues v = new ContentValues();
        v.put("status", w.optString("status"));
        v.put("accepted_at", w.optString("acceptedAt", ""));
        v.put("started_at", w.optString("startedAt", ""));
        v.put("finished_at", w.optString("finishedAt", ""));
        v.put("verified_at", w.optString("verifiedAt", ""));
        v.put("result", w.optString("result", ""));
        v.put("raw", w.toString());
        db.update("workorders", v, "id = ?", new String[]{w.optString("id")});
    }

    public JSONObject workorderCounts(String siteId) {
        SQLiteDatabase db = db();
        Cursor c = null;
        JSONObject out = new JSONObject();
        int open = 0, pending = 0, accepted = 0, processing = 0;
        try {
            c = db.rawQuery("SELECT status FROM workorders WHERE site_id = ?", new String[]{siteId});
            while (c.moveToNext()) {
                String s = c.getString(0);
                if ("pending".equals(s)) pending++;
                if ("accepted".equals(s)) accepted++;
                if ("processing".equals(s)) processing++;
                if (!"verified".equals(s) && !"closed".equals(s)) open++;
            }
            out.put("open", open);
            out.put("pending", pending);
            out.put("accepted", accepted);
            out.put("processing", processing);
        } catch (Exception e) {
            Log.w(TAG, "统计工单失败：" + e.getMessage());
        } finally {
            closeQuietly(c);
        }
        return out;
    }

    // ======================= 巡检 =======================

    public JSONArray inspections(String siteId) {
        SQLiteDatabase db = db();
        Cursor c = null;
        JSONArray out = new JSONArray();
        try {
            c = db.rawQuery("SELECT raw FROM inspections WHERE site_id = ? ORDER BY due_at", new String[]{siteId});
            while (c.moveToNext()) {
                JSONObject o = json(c.getString(0));
                if (o != null) out.put(o);
            }
        } catch (Exception e) {
            Log.w(TAG, "读取巡检失败：" + e.getMessage());
        } finally {
            closeQuietly(c);
        }
        return out;
    }

    public JSONObject inspection(String id) {
        SQLiteDatabase db = db();
        Cursor c = null;
        try {
            c = db.rawQuery("SELECT raw FROM inspections WHERE id = ?", new String[]{id});
            if (c.moveToFirst()) return json(c.getString(0));
        } catch (Exception e) {
            Log.w(TAG, "读取巡检失败：" + e.getMessage());
        } finally {
            closeQuietly(c);
        }
        return null;
    }

    public void updateInspection(JSONObject ins) {
        SQLiteDatabase db = db();
        ContentValues v = new ContentValues();
        v.put("status", ins.optString("status"));
        v.put("done_at", ins.optString("doneAt", ""));
        v.put("done_by", ins.optString("doneBy", ""));
        v.put("summary", ins.optString("summary", ""));
        v.put("raw", ins.toString());
        db.update("inspections", v, "id = ?", new String[]{ins.optString("id")});
        JSONArray items = ins.optJSONArray("items");
        if (items != null) {
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                if (item == null) continue;
                ContentValues iv = new ContentValues();
                iv.put("result", item.optString("result", ""));
                iv.put("note", item.optString("note", ""));
                db.update("inspection_items", iv, "inspection_id = ? AND item_key = ?",
                        new String[]{ins.optString("id"), item.optString("key")});
            }
        }
    }

    // ======================= 通知 =======================

    public void addNotification(String kind, String level, String title, String body,
                                String createdAt, String refId) {
        SQLiteDatabase db = db();
        ContentValues v = new ContentValues();
        v.put("kind", kind);
        v.put("level", level);
        v.put("title", title);
        v.put("body", body);
        v.put("created_at", createdAt);
        v.put("read", 0);
        v.put("ref_id", refId);
        db.insert("notifications", null, v);
    }

    public JSONArray notifications(int limit) {
        SQLiteDatabase db = db();
        Cursor c = null;
        JSONArray out = new JSONArray();
        try {
            c = db.rawQuery("SELECT kind, level, title, body, created_at, read, ref_id FROM notifications ORDER BY id DESC LIMIT ?",
                    new String[]{String.valueOf(limit)});
            while (c.moveToNext()) {
                JSONObject o = new JSONObject();
                o.put("kind", c.getString(0));
                o.put("level", c.getString(1));
                o.put("title", c.getString(2));
                o.put("body", c.getString(3));
                o.put("createdAt", c.getString(4));
                o.put("read", c.getInt(5) == 1);
                o.put("refId", c.getString(6));
                out.put(o);
            }
        } catch (Exception e) {
            Log.w(TAG, "读取通知失败：" + e.getMessage());
        } finally {
            closeQuietly(c);
        }
        return out;
    }

    // ======================= 单元索引 =======================

    /** unitCode → {name, short}，从种子 overview 的工艺单元提取。 */
    public JSONObject unitIndex() {
        JSONObject seed = metaJson(db(), "overview_seed");
        JSONObject out = new JSONObject();
        if (seed == null) return out;
        JSONArray units = seed.optJSONArray("process");
        if (units == null) return out;
        for (int i = 0; i < units.length(); i++) {
            JSONObject u = units.optJSONObject(i);
            if (u == null) continue;
            JSONObject item = new JSONObject();
            try {
                item.put("name", u.optString("name", u.optString("code")));
                item.put("short", u.optString("short", u.optString("code")));
                out.put(u.optString("code"), item);
            } catch (JSONException e) {
                Log.w(TAG, "构造单元索引失败");
            }
        }
        return out;
    }

    /** 单个点位当前值（引擎推进累计量时用，避免整表解析）。 */
    public double pointValue(String code, double def) {
        SQLiteDatabase db = db();
        Cursor c = null;
        try {
            c = db.rawQuery("SELECT value FROM points WHERE code = ? LIMIT 1", new String[]{code});
            if (c.moveToFirst()) return c.getDouble(0);
        } catch (Exception e) {
            Log.w(TAG, "读取点位值失败：" + e.getMessage());
        } finally {
            closeQuietly(c);
        }
        return def;
    }

    // ======================= 工具 =======================

    public static JSONObject json(String text) {
        if (text == null || text.length() == 0) return null;
        try {
            return new JSONObject(text);
        } catch (JSONException e) {
            return null;
        }
    }

    public static JSONObject copy(JSONObject o) {
        if (o == null) return new JSONObject();
        try {
            return new JSONObject(o.toString());
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    /** 递归平移 JSON 里的 ISO 时间字符串（"at" / "firstAt" / "createdAt" 等）。 */
    public static JSONObject shiftTimes(JSONObject o, long delta) {
        if (o == null) return null;
        JSONObject out = copy(o);
        if (delta == 0L) return out;
        java.util.Iterator<String> it = out.keys();
        try {
            while (it.hasNext()) {
                String k = it.next();
                Object v = out.opt(k);
                if (v instanceof String) {
                    String s = (String) v;
                    if (isIsoLike(s)) {
                        long t = LocalCore.parseIso(s);
                        if (t > 0) out.put(k, LocalCore.iso(t + delta));
                    }
                } else if (v instanceof JSONObject) {
                    out.put(k, shiftTimes((JSONObject) v, delta));
                } else if (v instanceof JSONArray) {
                    JSONArray arr = (JSONArray) v;
                    for (int i = 0; i < arr.length(); i++) {
                        Object item = arr.opt(i);
                        if (item instanceof JSONObject) {
                            arr.put(i, shiftTimes((JSONObject) item, delta));
                        } else if (item instanceof String) {
                            String s = (String) item;
                            if (isIsoLike(s)) {
                                long t = LocalCore.parseIso(s);
                                if (t > 0) arr.put(i, LocalCore.iso(t + delta));
                            }
                        }
                    }
                    out.put(k, arr);
                }
            }
        } catch (JSONException e) {
            Log.w(TAG, "时间平移失败：" + e.getMessage());
        }
        return out;
    }

    private static boolean isIsoLike(String s) {
        if (s == null || s.length() < 20 || s.length() > 30) return false;
        return s.charAt(4) == '-'
                && s.charAt(7) == '-'
                && (s.charAt(10) == 'T' || s.charAt(10) == ' ' && s.length() > 19);
    }

    private static void closeQuietly(java.io.Closeable c) {
        if (c == null) return;
        try {
            c.close();
        } catch (IOException ignored) {
            // ignore
        }
    }

    private static void closeQuietly(Cursor c) {
        if (c == null) return;
        try {
            c.close();
        } catch (Exception ignored) {
            // ignore
        }
    }
}
