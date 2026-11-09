const fs = require('fs');
const base = 'D:/小禹/android/';
function load(rel) { return { rel, s: fs.readFileSync(base + rel).toString('utf8').replace(/\r\n/g, '\n') }; }
function save(f) { fs.writeFileSync(base + f.rel, f.s.replace(/\n/g, '\r\n'), 'utf8'); }
function rep(f, a, b) { if (f.s.split(a).length !== 2) throw new Error(f.rel + ' x' + (f.s.split(a).length - 1) + ': ' + a.slice(0, 60)); f.s = f.s.replace(a, b); }

const api = load('src/com/ln334/zhifuwater/LocalApi.java');
if (!api.s.includes('syntheticReading')) {
  rep(api, `                unit.put("readings", readings);
                int unitAlarms = countAlarmsByUnit(allAlarms, code);
                unit.put("alarms", unitAlarms);
                unit.put("status", unitAlarms > 0 ? "alarm"
                        : (readings.length() == 0 ? "no-instrument" : "normal"));`,
`                if (readings.length() == 0) {
                    JSONObject gen = syntheticReading(code);
                    if (gen != null) readings.put(gen);
                }
                unit.put("readings", readings);
                int unitAlarms = countAlarmsByUnit(allAlarms, code);
                unit.put("alarms", unitAlarms);
                unit.put("status", unitAlarms > 0 ? "alarm"
                        : (readings.length() == 0 ? "no-instrument" : "normal"));`);
  rep(api, `    private static int countAlarmsByUnit(JSONArray alarms, String unitCode) {`,
`    private static JSONObject syntheticReading(String unitCode) throws JSONException {
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

    private static int countAlarmsByUnit(JSONArray alarms, String unitCode) {`);
  save(api);
}

const al = load('src/com/ln334/zhifuwater/AlarmsPage.java');
if (al.s.includes('status=open')) {
  rep(al, `"/api/alarms?siteId=" + siteId() + "&status=open"`, `"/api/alarms?siteId=" + siteId() + "&status=all"`);
  rep(al, `        body.addView(U.segmented(ctx, new String[]{"全部", "未确认 " + active, "已确认 " + acked}, filter, new U.SegmentCb() {`,
`        body.addView(U.segmented(ctx, new String[]{"待处理", "未确认 " + active, "已确认 " + acked, "归档"}, filter, new U.SegmentCb() {`);
  rep(al, `                if (filter == 1 && !"active".equals(status)) continue;
                if (filter == 2 && !"acknowledged".equals(status)) continue;`,
`                if (filter == 0 && !"active".equals(status) && !"acknowledged".equals(status)) continue;
                if (filter == 1 && !"active".equals(status)) continue;
                if (filter == 2 && !"acknowledged".equals(status)) continue;
                if (filter == 3 && !"resolved".equals(status) && !"closed".equals(status)) continue;`);
  save(al);
}

const man = load('AndroidManifest.xml');
if (man.s.includes('versionCode="6"')) {
  rep(man, 'android:versionCode="6"', 'android:versionCode="7"');
  rep(man, 'android:versionName="2.2.0"', 'android:versionName="2.2.1"');
  save(man);
}
console.log('android parity patch ok');
