package com.ln334.zhifuwater;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Iterator;

/**
 * 本机模式的“服务器”：路径与返回结构跟真实平台保持一致，
 * 数据来自 LocalDb（SQLite 快照 + 引擎实时推进）。
 *
 * <p>返回结构与服务器相同：成功 {ok:true,data:...}（列表附带 meta.counts），
 * 失败 {ok:false,error:{code,message}}。页面代码只认这套字段，因此不用改页面。</p>
 */
public final class LocalApi {

    private static final String TAG = "LocalApi";
    private static final String SITE = "site-1";

    private LocalApi() {
    }

    public static JSONObject respond(Context ctx, String method, String path, JSONObject body) {
        try {
            LocalDb store = LocalDb.get(ctx);
            String[] seg = LocalCore.splitPath(path);
            if (seg.length < 2 || !"api".equals(seg[0])) {
                return error("本机演示不支持的接口：" + path);
            }
            String type = seg[1];
            String siteId = siteId(store, path);
            boolean post = "POST".equalsIgnoreCase(method) || "PUT".equalsIgnoreCase(method);

            if ("auth".equals(type)) {
                if (seg.length >= 3 && "me".equals(seg[2])) {
                    return ok(me(store));
                }
                if (seg.length >= 3 && "login".equals(seg[2])) {
                    return login(store, body);
                }
                return error("本机演示不支持的接口：" + path);
            }
            if ("sites".equals(type)) {
                return sites(store);
            }
            if ("overview".equals(type)) {
                return ok(overview(store, siteId));
            }
            if ("alarms".equals(type)) {
                if (seg.length == 2) return alarms(store, siteId, path);
                if (seg.length == 4 && post) {
                    String id = seg[2];
                    String action = seg[3];
                    if ("ack".equals(action)) return ackAlarm(store, id);
                    if ("resolve".equals(action) || "close".equals(action)) return closeAlarm(store, id, action);
                }
                return error("本机演示不支持的接口：" + path);
            }
            if ("workorders".equals(type)) {
                if (seg.length == 2) return workorders(store, siteId, path);
                if (seg.length == 4 && post) return workorderAction(store, seg[2], seg[3], body);
                return error("本机演示不支持的接口：" + path);
            }
            if ("inspections".equals(type)) {
                if (seg.length == 2) return inspections(store, siteId);
                if (seg.length == 3) return inspection(store, seg[2]);
                if (seg.length == 4 && "submit".equals(seg[3]) && post) {
                    return submitInspection(store, seg[2], body);
                }
                return error("本机演示不支持的接口：" + path);
            }
            if ("points".equals(type)) {
                JSONArray list = store.pointList(siteId);
                JSONObject meta = new JSONObject();
                meta.put("total", list.length());
                return ok(list, meta);
            }
            if ("telemetry".equals(type)) {
                if (seg.length == 3 && "latest".equals(seg[2])) {
                    JSONObject o = new JSONObject();
                    o.put("siteId", siteId);
                    o.put("at", LocalCore.iso(System.currentTimeMillis()));
                    o.put("items", store.pointList(siteId));
                    return ok(o);
                }
                if (seg.length == 3 && "history".equals(seg[2])) {
                    String code = LocalCore.query(path, "code");
                    if (LocalCore.isBlank(code)) return error("缺少 code 参数");
                    int limit = 96;
                    String lim = LocalCore.query(path, "limit");
                    if (!LocalCore.isBlank(lim)) {
                        try {
                            limit = Integer.parseInt(lim);
                        } catch (NumberFormatException ignored) {
                        }
                    }
                    JSONObject o = new JSONObject();
                    o.put("siteId", siteId);
                    o.put("code", code);
                    o.put("points", store.telemetry(code, Math.max(2, Math.min(limit, 720))));
                    return ok(o);
                }
                return error("本机演示不支持的接口：" + path);
            }
            if ("devices".equals(type)) {
                JSONArray list = store.deviceList(siteId);
                JSONObject meta = new JSONObject();
                meta.put("total", list.length());
                return ok(list, meta);
            }
            if ("lab".equals(type)) {
                if (seg.length == 3 && "stats".equals(seg[2])) {
                    int days = 30;
                    String d = LocalCore.query(path, "days");
                    if (!LocalCore.isBlank(d)) {
                        try {
                            days = Integer.parseInt(d);
                        } catch (NumberFormatException ignored) {
                        }
                    }
                    return ok(store.labStats(siteId, Math.max(1, Math.min(days, 90))));
                }
                if (seg.length == 4 && "review".equals(seg[3]) && post) {
                    return ok(store.reviewLab(seg[2], reviewer(store)));
                }
                if (seg.length == 2) {
                    String status = LocalCore.query(path, "status");
                    JSONArray list = store.labList(siteId, status, 60);
                    JSONObject meta = store.labCounts(siteId);
                    return ok(list, meta);
                }
                return error("本机演示不支持的接口：" + path);
            }
            if ("diagnosis".equals(type)) {
                if (seg.length == 2) return ok(Diagnosis.run(store, siteId));
                return error("本机演示不支持的接口：" + path);
            }
            if ("notifications".equals(type)) {
                JSONArray list = store.notifications(30);
                JSONObject meta = new JSONObject();
                meta.put("total", list.length());
                return ok(list, meta);
            }
            return error("本机演示不支持的接口：" + path);
        } catch (Throwable t) {
            Log.e(TAG, "本机接口失败：" + path, t);
            return error("本机数据处理失败：" + t.getMessage());
        }
    }

    // ======================= 包络 =======================

    private static JSONObject ok(Object data) {
        return ok(data, null);
    }

    private static JSONObject ok(Object data, JSONObject meta) {
        JSONObject root = new JSONObject();
        try {
            root.put("ok", true);
            root.put("data", Json.denull(data));
            if (meta != null) root.put("meta", meta);
        } catch (JSONException e) {
            Log.w(TAG, "构造响应失败：" + e.getMessage());
        }
        return root;
    }

    private static JSONObject error(String message) {
        JSONObject root = new JSONObject();
        JSONObject err = new JSONObject();
        try {
            err.put("code", "LOCAL_ERROR");
            err.put("message", message == null ? "本机数据异常" : message);
            root.put("ok", false);
            root.put("error", err);
        } catch (JSONException e) {
            Log.w(TAG, "构造错误响应失败：" + e.getMessage());
        }
        return root;
    }

    // ======================= 账号 =======================

    private static JSONObject me(LocalDb store) {
        JSONObject me = store.metaJson(store.db(), "me");
        return me == null ? new JSONObject() : me;
    }

    private static JSONObject login(LocalDb store, JSONObject body) throws JSONException {
        String username = body == null ? "" : body.optString("username");
        if (LocalCore.isBlank(username)) return error("请输入账号");
        JSONObject me = me(store);
        JSONObject user = me.optJSONObject("user");
        JSONObject data = new JSONObject();
        data.put("token", "local-" + System.currentTimeMillis());
        data.put("user", user == null ? new JSONObject() : user);
        return ok(data);
    }

    private static String currentUserName(LocalDb store) {
        JSONObject me = store.metaJson(store.db(), "me");
        JSONObject user = me == null ? null : me.optJSONObject("user");
        String name = user == null ? "" : user.optString("name");
        return LocalCore.isBlank(name) ? "平台管理员" : name;
    }

    private static String userName(String uid) {
        if (LocalCore.isBlank(uid)) return "";
        if ("u-1".equals(uid)) return "平台管理员";
        if ("u-4".equals(uid)) return "运行值班员";
        if ("u-5".equals(uid)) return "现场维修";
        if ("u-6".equals(uid)) return "巡检员";
        return uid;
    }

    // ======================= 站点 =======================


    private static String reviewer(LocalDb store) {
        JSONObject me = store.metaJson(store.db(), "me");
        if (me == null) return "值班员";
        String name = me.optString("name");
        return LocalCore.isBlank(name) ? "值班员" : name;
    }

    private static String siteId(LocalDb store, String path) {
        String s = LocalCore.query(path, "siteId");
        if (LocalCore.isBlank(s)) s = store.metaString(store.db(), "site_id");
        return LocalCore.isBlank(s) ? SITE : s;
    }

    private static JSONObject sites(LocalDb store) throws JSONException {
        JSONArray raw = store.sites();
        JSONArray out = new JSONArray();
        int total = 0;
        int devicesTotal = devicesTotal(store);
        for (int i = 0; i < raw.length(); i++) {
            JSONObject site = LocalDb.copy(raw.optJSONObject(i));
            if (site == null) continue;
            total++;
            if (SITE.equals(site.optString("id"))) {
                JSONObject points = store.points(SITE);
                JSONObject ac = store.alarmCounts(SITE);
                JSONObject wc = store.workorderCounts(SITE);
                int active = ac.optInt("active", 0) + ac.optInt("acknowledged", 0);
                int critical = ac.optInt("critical", 0);
                JSONObject counts = new JSONObject();
                counts.put("devices", devicesTotal);
                counts.put("installed", devicesTotal);
                counts.put("onlineDevices", devicesTotal);
                counts.put("points", points.length());
                counts.put("onlinePoints", points.length());
                counts.put("activeAlarms", active);
                counts.put("criticalAlarms", critical);
                counts.put("openWorkorders", wc.optInt("open", 0));
                site.put("counts", counts);
                site.put("health", Math.max(40, 100 - active * 3 - critical * 5));
                String worst = worstLevel(store.alarms(SITE, null));
                site.put("worstAlarmLevel", worst);
                site.put("worstAlarmLevelName", LocalCore.levelName(worst));
                site.put("coverage", 100);
            }
            out.put(site);
        }
        JSONObject meta = new JSONObject();
        meta.put("total", total);
        return ok(out, meta);
    }

    private static int devicesTotal(LocalDb store) {
        JSONObject seed = store.metaJson(store.db(), "overview_seed");
        if (seed == null) return 0;
        JSONArray units = seed.optJSONArray("process");
        if (units == null) return 0;
        int total = 0;
        for (int i = 0; i < units.length(); i++) {
            JSONObject u = units.optJSONObject(i);
            JSONObject devices = u == null ? null : u.optJSONObject("devices");
            if (devices != null) total += devices.optInt("total", 0);
        }
        return total;
    }

    private static String worstLevel(JSONArray alarms) {
        String worst = null;
        for (int i = 0; i < alarms.length(); i++) {
            JSONObject a = alarms.optJSONObject(i);
            if (a == null) continue;
            String st = a.optString("status");
            if (!LocalCore.ALARM_ACTIVE.equals(st) && !LocalCore.ALARM_ACK.equals(st)) continue;
            String level = a.optString("level");
            if (worst == null || LocalCore.levelRank(level) > LocalCore.levelRank(worst)) worst = level;
        }
        return worst == null ? "normal" : worst;
    }

    // ======================= 总览 =======================

    private static JSONObject overview(LocalDb store, String siteId) throws JSONException {
        SQLiteDatabase db = store.db();
        long now = System.currentTimeMillis();
        String nowIso = LocalCore.iso(now);
        JSONObject seed = store.metaJson(db, "overview_seed");
        JSONObject out = seed == null ? new JSONObject() : LocalDb.copy(seed);

        JSONObject site = store.site(siteId);
        if (site == null) site = store.site(SITE);
        out.put("site", site == null ? new JSONObject() : site);
        out.put("generatedAt", nowIso);
        out.put("dayKey", LocalCore.dayKey(now));

        JSONObject points = store.points(SITE);
        JSONArray allAlarms = store.alarms(SITE, null);
        JSONObject alarmCounts = store.alarmCounts(SITE);
        JSONObject woCounts = store.workorderCounts(SITE);

        // 工艺单元读数（保留种子里的顺序，额外追加本机新增的累计量点位）
        JSONArray units = out.optJSONArray("process");
        if (units != null) {
            for (int i = 0; i < units.length(); i++) {
                JSONObject unit = units.optJSONObject(i);
                if (unit == null) continue;
                String code = unit.optString("code");
                JSONArray readings = new JSONArray();
                HashSet<String> used = new HashSet<String>();
                JSONArray seedReadings = unit.optJSONArray("readings");
                if (seedReadings != null) {
                    for (int j = 0; j < seedReadings.length(); j++) {
                        JSONObject sr = seedReadings.optJSONObject(j);
                        if (sr == null) continue;
                        String pc = sr.optString("code");
                        used.add(pc);
                        JSONObject cur = points.optJSONObject(pc);
                        readings.put(cur == null ? sr : mergeReading(sr, cur));
                    }
                }
                Iterator<String> it = points.keys();
                while (it.hasNext()) {
                    String pc = it.next();
                    if (used.contains(pc)) continue;
                    JSONObject cur = points.optJSONObject(pc);
                    if (cur == null) continue;
                    if (!code.equals(cur.optString("unitCode"))) continue;
                    readings.put(cur);
                }
                if (readings.length() == 0) {
                    JSONObject gen = syntheticReading(code);
                    if (gen != null) readings.put(gen);
                }
                unit.put("readings", readings);
                int unitAlarms = countAlarmsByUnit(allAlarms, code);
                unit.put("alarms", unitAlarms);
                unit.put("status", unitAlarms > 0 ? "alarm"
                        : (readings.length() == 0 ? "no-instrument" : "normal"));
            }
        }

        // KPI
        double energyToday = store.metaDouble(db, "energy_today_kwh", 0);
        double pacToday = store.metaDouble(db, "pac_today_l", 0);
        double pamToday = store.metaDouble(db, "pam_today_l", 0);
        double volume = store.metaDouble(db, "volume_today_m3", 0);
        int activeAlarms = alarmCounts.optInt("active", 0) + alarmCounts.optInt("acknowledged", 0);
        JSONArray kpis = out.optJSONArray("kpis");
        if (kpis != null) {
            for (int i = 0; i < kpis.length(); i++) {
                JSONObject k = kpis.optJSONObject(i);
                if (k == null) continue;
                String key = k.optString("key");
                int digits = k.optInt("digits", 2);
                if ("volume".equals(key)) {
                    k.put("value", LocalCore.round(volume, digits));
                    k.put("status", "ok");
                } else if ("flow".equals(key)) {
                    k.put("value", LocalCore.round(points.optJSONObject("FLOW.IN") == null ? 0
                            : points.optJSONObject("FLOW.IN").optDouble("value", 0), digits));
                } else if ("power".equals(key)) {
                    k.put("value", LocalCore.round(points.optJSONObject("POWER.KW") == null ? 0
                            : points.optJSONObject("POWER.KW").optDouble("value", 0), digits));
                } else if ("energy".equals(key)) {
                    k.put("value", LocalCore.round(energyToday, digits));
                } else if ("online".equals(key)) {
                    k.put("value", 100);
                    k.put("unit", "%");
                } else if ("alarms".equals(key)) {
                    k.put("value", activeAlarms);
                    k.put("status", activeAlarms > 0 ? "attention" : "ok");
                } else if ("workorders".equals(key)) {
                    k.put("value", woCounts.optInt("open", 0));
                    k.put("status", woCounts.optInt("open", 0) > 0 ? "attention" : "ok");
                }
            }
        }

        // 趋势：24 小时（30 分钟粒度），来自 telemetry
        JSONObject trends = out.optJSONObject("trends");
        if (trends == null) {
            trends = new JSONObject();
            out.put("trends", trends);
        }
        Iterator<String> trendKeys = trends.keys();
        while (trendKeys.hasNext()) {
            String code = trendKeys.next();
            JSONObject trend = trends.optJSONObject(code);
            if (trend == null) continue;
            JSONArray pts = store.telemetry(code, 49);
            if (pts.length() > 0) trend.put("points", pts);
        }

        out.put("alarms", recentAlarms(allAlarms, 6));
        out.put("alarmCounts", alarmCounts);
        out.put("workorders", limit(store.workorders(SITE, false), 5, true));
        out.put("workorderCounts", woCounts);

        JSONObject resources = new JSONObject();
        resources.put("energyTodayKwh", LocalCore.round(energyToday, 2));
        resources.put("pacTodayL", LocalCore.round(pacToday, 2));
        resources.put("pamTodayL", LocalCore.round(pamToday, 2));
        out.put("resources", resources);

        out.put("dataHealth", dataHealth(points, now));
        out.put("notice", "本机演示由内置模拟引擎生成：数据每 5 秒推进，告警与工单均可操作，重启后仍保留。");
        return out;
    }

    private static JSONObject mergeReading(JSONObject seed, JSONObject cur) throws JSONException {
        JSONObject r = LocalDb.copy(seed);
        r.put("value", cur.optDouble("value", 0));
        r.put("v", cur.optDouble("value", 0));
        r.put("t", cur.optString("t"));
        r.put("quality", cur.optString("quality", "good"));
        r.put("q", cur.optString("quality", "good"));
        r.put("stale", false);
        return r;
    }

    private static JSONObject syntheticReading(String unitCode) throws JSONException {
        String code, name, unit, fmt;
        double base, amp;
        if ("grit".equals(unitCode)) { code = "GRIT.LVL"; name = "格栅池液位"; unit = "%"; fmt = "%.1f"; base = 22; amp = 3; }
        else if ("primary".equals(unitCode)) { code = "PRIMARY.LVL"; name = "初沉池液位"; unit = "%"; fmt = "%.1f"; base = 46; amp = 5; }
        else if ("dist2".equals(unitCode)) { code = "DIST2.FLOW"; name = "配水槽2流量"; unit = "m³/h"; fmt = "%.3f"; base = 0.10; amp = 0.015; }
        else return null;
        double t = System.currentTimeMillis() / 1000.0;
        double v = base + amp * Math.sin(t / 37.0 + unitCode.hashCode() % 17);
        JSONObject o = new JSONObject();
        o.put("code", code);
        o.put("name", name);
        o.put("unit", unit);
        o.put("unitCode", unitCode);
        o.put("value", Double.parseDouble(String.format(java.util.Locale.US, fmt, v)));
        o.put("text", String.format(java.util.Locale.US, fmt, v) + " " + unit);
        o.put("quality", "good");
        o.put("at", LocalCore.iso(System.currentTimeMillis()));
        return o;
    }

    private static int countAlarmsByUnit(JSONArray alarms, String unitCode) {
        int n = 0;
        for (int i = 0; i < alarms.length(); i++) {
            JSONObject a = alarms.optJSONObject(i);
            if (a == null) continue;
            String st = a.optString("status");
            if (!LocalCore.ALARM_ACTIVE.equals(st) && !LocalCore.ALARM_ACK.equals(st)) continue;
            if (unitCode.equals(a.optString("unitCode"))) n++;
        }
        return n;
    }

    private static JSONArray recentAlarms(JSONArray alarms, int limit) throws JSONException {
        JSONArray out = new JSONArray();
        for (int i = 0; i < alarms.length() && out.length() < limit; i++) {
            JSONObject a = alarms.optJSONObject(i);
            if (a == null) continue;
            String st = a.optString("status");
            if (!LocalCore.ALARM_ACTIVE.equals(st) && !LocalCore.ALARM_ACK.equals(st)) continue;
            out.put(enrichAlarm(a));
        }
        return out;
    }

    private static JSONArray limit(JSONArray source, int max, boolean enrichWorkorder) throws JSONException {
        JSONArray out = new JSONArray();
        for (int i = 0; i < source.length() && out.length() < max; i++) {
            JSONObject o = source.optJSONObject(i);
            if (o == null) continue;
            out.put(enrichWorkorder ? enrichWorkorder(o) : o);
        }
        return out;
    }

    private static JSONObject dataHealth(JSONObject points, long now) throws JSONException {
        JSONObject health = new JSONObject();
        long latest = 0;
        int online = 0;
        Iterator<String> it = points.keys();
        while (it.hasNext()) {
            JSONObject p = points.optJSONObject(it.next());
            if (p == null) continue;
            if ("good".equals(p.optString("quality", "good"))) online++;
            long t = LocalCore.parseIso(p.optString("t"));
            if (t > latest) latest = t;
        }
        health.put("gateway", "connected");
        health.put("pointsTotal", points.length());
        health.put("pointsOnline", online);
        health.put("latestAt", latest > 0 ? LocalCore.iso(latest) : LocalCore.iso(now));
        health.put("delaySec", latest > 0 ? Math.max(0, (now - latest) / 1000) : 0);
        health.put("quality", online == points.length() ? "good" : "attention");
        return health;
    }

    // ======================= 告警 =======================

    private static JSONObject alarms(LocalDb store, String siteId, String path) throws JSONException {
        String status = LocalCore.query(path, "status");
        JSONArray all = store.alarms(siteId, null);
        JSONArray out = new JSONArray();
        for (int i = 0; i < all.length(); i++) {
            JSONObject a = all.optJSONObject(i);
            if (a == null) continue;
            if (!matchesAlarmFilter(a.optString("status"), status)) continue;
            out.put(enrichAlarm(a));
        }
        JSONObject meta = new JSONObject();
        meta.put("counts", store.alarmCounts(siteId));
        return ok(out, meta);
    }

    private static boolean matchesAlarmFilter(String st, String status) {
        boolean open = LocalCore.ALARM_ACTIVE.equals(st) || LocalCore.ALARM_ACK.equals(st);
        if (LocalCore.isBlank(status) || "all".equals(status)) return true;
        if ("open".equals(status)) return open;
        if ("done".equals(status) || "resolved".equals(status)) {
            return LocalCore.ALARM_RESOLVED.equals(st) || LocalCore.ALARM_CLOSED.equals(st);
        }
        return status.equals(st);
    }

    private static JSONObject enrichAlarm(JSONObject a) throws JSONException {
        long now = System.currentTimeMillis();
        long first = LocalCore.parseIso(a.optString("firstAt"));
        if (first > 0) a.put("durationMin", (int) ((now - first) / LocalCore.MINUTE));
        a.put("levelName", LocalCore.levelName(a.optString("level")));
        String ackBy = a.optString("ackBy");
        if (!LocalCore.isBlank(ackBy) && LocalCore.isBlank(a.optString("ackByName"))) {
            a.put("ackByName", userName(ackBy));
        }
        String resolvedBy = a.optString("resolvedBy");
        if (!LocalCore.isBlank(resolvedBy) && LocalCore.isBlank(a.optString("resolvedByName"))) {
            a.put("resolvedByName", userName(resolvedBy));
        }
        return a;
    }

    private static JSONObject ackAlarm(LocalDb store, String id) throws JSONException {
        JSONObject a = store.alarm(id);
        if (a == null) return error("告警不存在或已被清理");
        if (!LocalCore.canAck(a.optString("status"))) {
            return error("该告警已确认或已恢复，无需重复确认");
        }
        String nowIso = LocalCore.iso(System.currentTimeMillis());
        a.put("status", LocalCore.ALARM_ACK);
        a.put("ackAt", nowIso);
        a.put("ackBy", "u-1");
        a.put("ackByName", currentUserName(store));
        store.upsertAlarm(a);
        store.addNotification("ack", a.optString("level", "info"), "告警已确认 · " + a.optString("title"),
                "由" + currentUserName(store) + "在本机确认。", nowIso, id);
        JSONObject data = new JSONObject();
        data.put("alarm", enrichAlarm(a));
        return ok(data);
    }

    private static JSONObject closeAlarm(LocalDb store, String id, String action) throws JSONException {
        JSONObject a = store.alarm(id);
        if (a == null) return error("告警不存在或已被清理");
        if (!LocalCore.canClose(a.optString("status"))) {
            return error("该告警已经恢复/关闭");
        }
        String nowIso = LocalCore.iso(System.currentTimeMillis());
        a.put("status", "close".equals(action) ? LocalCore.ALARM_CLOSED : LocalCore.ALARM_RESOLVED);
        a.put("resolvedAt", nowIso);
        a.put("resolvedBy", "u-1");
        a.put("resolvedByName", currentUserName(store));
        long first = LocalCore.parseIso(a.optString("firstAt"));
        if (first > 0) a.put("durationMin", (int) ((System.currentTimeMillis() - first) / LocalCore.MINUTE));
        store.upsertAlarm(a);
        JSONObject data = new JSONObject();
        data.put("alarm", enrichAlarm(a));
        return ok(data);
    }

    // ======================= 工单 =======================

    private static JSONObject workorders(LocalDb store, String siteId, String path) throws JSONException {
        String status = LocalCore.query(path, "status");
        boolean doneGroup = "done".equals(status);
        JSONArray list = store.workorders(siteId, doneGroup);
        JSONArray out = new JSONArray();
        for (int i = 0; i < list.length(); i++) {
            JSONObject w = list.optJSONObject(i);
            if (w != null) out.put(enrichWorkorder(w));
        }
        JSONObject counts = store.workorderCounts(siteId);
        int overdue = 0;
        JSONArray open = store.workorders(siteId, false);
        for (int i = 0; i < open.length(); i++) {
            JSONObject w = open.optJSONObject(i);
            if (w != null && isOverdue(w)) overdue++;
        }
        counts.put("overdue", overdue);
        JSONObject meta = new JSONObject();
        meta.put("counts", counts);
        return ok(out, meta);
    }

    private static boolean isOverdue(JSONObject w) {
        String status = w.optString("status");
        if (LocalCore.isFinal(status)) return false;
        long due = LocalCore.parseIso(w.optString("dueAt"));
        return due > 0 && System.currentTimeMillis() > due;
    }

    private static JSONObject enrichWorkorder(JSONObject w) throws JSONException {
        long now = System.currentTimeMillis();
        String status = w.optString("status");
        w.put("statusName", LocalCore.woStatusName(status));
        w.put("priorityName", LocalCore.woPriorityName(w.optString("priority")));
        w.put("typeName", LocalCore.woTypeName(w.optString("type")));
        long due = LocalCore.parseIso(w.optString("dueAt"));
        if (due > 0) {
            w.put("dueInHours", LocalCore.round((due - now) / (double) LocalCore.HOUR, 1));
            w.put("overdue", isOverdue(w));
        } else {
            w.put("overdue", false);
        }
        String assignee = w.optString("assigneeId");
        if (LocalCore.isBlank(w.optString("assigneeName")) && !LocalCore.isBlank(assignee)) {
            w.put("assigneeName", userName(assignee));
        }
        String creator = w.optString("creatorId");
        if (LocalCore.isBlank(w.optString("creatorName")) && !LocalCore.isBlank(creator)) {
            w.put("creatorName", userName(creator));
        }
        return w;
    }

    private static JSONObject workorderAction(LocalDb store, String id, String action, JSONObject body)
            throws JSONException {
        JSONObject w = store.workorder(id);
        if (w == null) return error("工单不存在");
        String status = w.optString("status");
        String next = LocalCore.statusAfter(status, action);
        if (next == null) {
            return error("工单当前状态（" + LocalCore.woStatusName(status) + "）不允许「"
                    + LocalCore.actionName(action) + "」");
        }
        String nowIso = LocalCore.iso(System.currentTimeMillis());
        w.put("status", next);
        String field = LocalCore.stampField(action);
        if (field != null) w.put(field, nowIso);
        if (LocalCore.ACTION_FINISH.equals(action) && body != null) {
            String result = body.optString("result");
            if (!LocalCore.isBlank(result)) w.put("result", result);
            String parts = body.optString("parts");
            if (!LocalCore.isBlank(parts)) w.put("parts", parts);
        }
        JSONArray timeline = w.optJSONArray("timeline");
        if (timeline == null) timeline = new JSONArray();
        JSONObject entry = new JSONObject();
        entry.put("at", nowIso);
        entry.put("by", "u-1");
        entry.put("action", action);
        entry.put("note", LocalCore.actionName(action) + "（本机演示）");
        timeline.put(entry);
        w.put("timeline", timeline);
        store.updateWorkorder(w);
        JSONObject data = new JSONObject();
        data.put("workorder", enrichWorkorder(w));
        return ok(data);
    }

    // ======================= 巡检 =======================

    private static JSONObject inspections(LocalDb store, String siteId) throws JSONException {
        JSONArray list = store.inspections(siteId);
        JSONArray out = new JSONArray();
        int pending = 0;
        int done = 0;
        for (int i = 0; i < list.length(); i++) {
            JSONObject ins = list.optJSONObject(i);
            if (ins == null) continue;
            if ("done".equals(ins.optString("status"))) done++;
            else pending++;
            out.put(enrichInspection(ins));
        }
        JSONObject counts = new JSONObject();
        counts.put("pending", pending);
        counts.put("done", done);
        counts.put("total", pending + done);
        JSONObject meta = new JSONObject();
        meta.put("counts", counts);
        return ok(out, meta);
    }

    private static JSONObject inspection(LocalDb store, String id) throws JSONException {
        JSONObject ins = store.inspection(id);
        if (ins == null) return error("巡检任务不存在");
        return ok(enrichInspection(ins));
    }

    private static JSONObject enrichInspection(JSONObject ins) throws JSONException {
        JSONArray items = ins.optJSONArray("items");
        int total = items == null ? 0 : items.length();
        int done = 0;
        if (items != null) {
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                if (item != null && !LocalCore.isBlank(item.optString("result"))) done++;
            }
        }
        ins.put("doneCount", done);
        ins.put("totalCount", total);
        long due = LocalCore.parseIso(ins.optString("dueAt"));
        ins.put("overdue", due > 0 && System.currentTimeMillis() > due
                && "pending".equals(ins.optString("status")));
        String assignee = ins.optString("assigneeId");
        if (LocalCore.isBlank(ins.optString("assigneeName")) && !LocalCore.isBlank(assignee)) {
            ins.put("assigneeName", userName(assignee));
        }
        if (LocalCore.isBlank(ins.optString("planName"))) {
            ins.put("planName", ins.optString("title"));
        }
        return ins;
    }

    private static JSONObject submitInspection(LocalDb store, String id, JSONObject body) throws JSONException {
        JSONObject ins = store.inspection(id);
        if (ins == null) return error("巡检任务不存在");
        if ("done".equals(ins.optString("status"))) return error("该巡检任务已提交，请勿重复提交");
        JSONArray items = ins.optJSONArray("items");
        if (items == null) items = new JSONArray();
        JSONArray submitted = body == null ? null : body.optJSONArray("items");
        if (submitted != null) {
            // 先校验，避免写一半
            for (int i = 0; i < submitted.length(); i++) {
                JSONObject s = submitted.optJSONObject(i);
                if (s == null) continue;
                String result = s.optString("result");
                if (!LocalCore.isBlank(result) && !LocalCore.validInspectResult(result)) {
                    return error("巡检结果取值不合法：" + result);
                }
            }
            for (int i = 0; i < submitted.length(); i++) {
                JSONObject s = submitted.optJSONObject(i);
                if (s == null) continue;
                String key = s.optString("key");
                for (int j = 0; j < items.length(); j++) {
                    JSONObject item = items.optJSONObject(j);
                    if (item == null || !key.equals(item.optString("key"))) continue;
                    item.put("result", s.optString("result"));
                    item.put("note", s.optString("note"));
                }
            }
        }
        int doneCount = 0;
        for (int j = 0; j < items.length(); j++) {
            JSONObject item = items.optJSONObject(j);
            if (item != null && !LocalCore.isBlank(item.optString("result"))) doneCount++;
        }
        if (doneCount == 0) return error("请至少填写一项巡检结果");
        String nowIso = LocalCore.iso(System.currentTimeMillis());
        ins.put("items", items);
        ins.put("status", "done");
        ins.put("doneAt", nowIso);
        ins.put("doneBy", "u-1");
        ins.put("doneByName", currentUserName(store));
        ins.put("summary", body == null ? "" : body.optString("summary"));
        ins.put("doneCount", doneCount);
        ins.put("totalCount", items.length());
        store.updateInspection(ins);
        store.addNotification("inspection", "info", "巡检已提交 · " + ins.optString("title"),
                "共 " + items.length() + " 项，已完成 " + doneCount + " 项。", nowIso, id);
        return ok(enrichInspection(ins));
    }
}
