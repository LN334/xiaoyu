package com.ln334.zhifuwater;

import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * 总览：站点状态、KPI、数据健康、工艺单元横向状态条、最近告警。
 */
public class OverviewPage extends BasePage {

    /** 静默刷新（每 5 秒）时保留工艺条横向位置。 */
    private HorizontalScrollView stripView;
    private int stripX;

    OverviewPage(MainActivity host) {
        super(host);
    }

    @Override
    protected String pageTitle() {
        return "总览";
    }

    @Override
    protected String pageSubtitle() {
        return "";
    }

    @Override
    void load() {
        setBusy(true);
        Api.get(ctx, "/api/overview?siteId=" + siteId(), new Api.Cb() {
            @Override
            public void done(JSONObject root, String error) {
                if (!alive()) return;
                setBusy(false);
                if (error != null) {
                    showError(error);
                    return;
                }
                JSONObject data = root == null ? null : root.optJSONObject("data");
                if (data == null) {
                    showError("响应中缺少站点数据");
                    return;
                }
                render(data);
            }
        });
    }

    private void render(JSONObject data) {
        if (stripView != null) stripX = stripView.getScrollX();
        clearBody();
        addHead();

        JSONObject site = data.optJSONObject("site");
        JSONArray kpis = data.optJSONArray("kpis");
        JSONObject health = data.optJSONObject("dataHealth");
        JSONArray process = data.optJSONArray("process");
        JSONArray alarms = data.optJSONArray("alarms");

        addCard(buildHero(site, kpis, data));
        if (kpis != null) buildKpis(kpis);
        if (health != null) buildHealth(health);
        if (process != null) buildProcess(process);
        buildRecentAlarms(alarms);
        afterRender();
    }

    /* ------------------------------ 站点卡片 ------------------------------ */

    private View buildHero(JSONObject site, JSONArray kpis, JSONObject data) {
        LinearLayout hero = U.linear(ctx, LinearLayout.VERTICAL);
        hero.setBackgroundResource(R.drawable.bg_hero);
        U.pad(hero, ctx, 16, 14, 16, 15);

        LinearLayout top = U.linear(ctx, LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        String status = site == null ? "online" : site.optString("status", "online");
        TextView statusChip = U.tv(ctx, U.siteStatusName(status), 10.5f, U.WHITE, false);
        statusChip.setBackground(U.roundBg(ctx, 0x2EFFFFFF, 10));
        statusChip.setPadding(U.dp(ctx, 9), U.dp(ctx, 4), U.dp(ctx, 9), U.dp(ctx, 4));
        top.addView(statusChip);
        top.addView(new View(ctx), U.lp(0, 1, 1f));
        TextView updated = U.tv(ctx, "更新 " + U.timeFull(data.optString("generatedAt")), 9.5f, 0xCCFFFFFF, false);
        top.addView(updated);
        hero.addView(top);

        String name = site == null ? "站点" : site.optString("name", "站点");
        hero.addView(U.tv(ctx, name, 20, U.WHITE, true),
                U.lpWith(ctx, U.MATCH, U.WRAP, 0, 9, 0, 0));

        View line = new View(ctx);
        line.setBackgroundColor(0x33FFFFFF);
        hero.addView(line, U.lpWith(ctx, U.MATCH, Math.max(1, U.dp(ctx, 0.8f)), 0, 12, 0, 11));

        LinearLayout stats = U.linear(ctx, LinearLayout.HORIZONTAL);
        stats.addView(heroStat("处理规模", site == null ? "--" : site.optString("capacity", "--"), 12), U.lp(0, U.WRAP, 1.2f));
        stats.addView(heroStat("点位在线率", kpiText(kpis, "online", "--"), 15), U.lp(0, U.WRAP, 1f));
        int alarmCount = 0;
        JSONObject alarmCounts = data.optJSONObject("alarmCounts");
        if (alarmCounts != null) alarmCount = alarmCounts.optInt("active", 0);
        stats.addView(heroStat("活动告警", alarmCount + " 条", 15), U.lp(0, U.WRAP, 1f));
        hero.addView(stats);
        return hero;
    }

    private LinearLayout heroStat(String label, String value, float valueSp) {
        LinearLayout col = U.linear(ctx, LinearLayout.VERTICAL);
        TextView v = U.tv(ctx, value, valueSp, U.WHITE, true);
        v.setSingleLine(true);
        v.setEllipsize(TextUtils.TruncateAt.END);
        col.addView(v);
        col.addView(U.tv(ctx, label, 10, 0xCCFFFFFF, false),
                U.lpWith(ctx, U.MATCH, U.WRAP, 0, 3, 0, 0));
        return col;
    }

    private String kpiText(JSONArray kpis, String key, String fallback) {
        if (kpis == null) return fallback;
        for (int i = 0; i < kpis.length(); i++) {
            JSONObject k = kpis.optJSONObject(i);
            if (k != null && key.equals(k.optString("key"))) {
                return kpiValueText(k);
            }
        }
        return fallback;
    }

    private String kpiValueText(JSONObject kpi) {
        String display = Json.str(kpi, "display", "");
        if (!TextUtils.isEmpty(display)) return display;
        double v = kpi.optDouble("value", 0);
        String unit = kpi.optString("unit", "");
        String num = U.num(v, kpi.optInt("digits", 2));
        if (TextUtils.isEmpty(unit)) return num;
        if ("%".equals(unit)) return num + "%";
        return num + " " + unit;
    }

    /* ------------------------------ KPI ------------------------------ */

    private void buildKpis(JSONArray kpis) {
        JSONObject map = new JSONObject();
        for (int i = 0; i < kpis.length(); i++) {
            JSONObject k = kpis.optJSONObject(i);
            if (k == null) continue;
            try {
                map.put(k.optString("key"), k);
            } catch (Exception ignored) {
                // ignore
            }
        }
        String[] preferred = {"volume", "alarms", "workorders", "online", "cod", "energy"};
        List<JSONObject> chosen = new ArrayList<JSONObject>();
        for (String key : preferred) {
            JSONObject k = map.optJSONObject(key);
            if (k != null) chosen.add(k);
        }
        for (int i = 0; i < kpis.length() && chosen.size() < 6; i++) {
            JSONObject k = kpis.optJSONObject(i);
            if (k == null) continue;
            if (!chosen.contains(k)) chosen.add(k);
        }

        LinearLayout grid = U.linear(ctx, LinearLayout.VERTICAL);
        for (int i = 0; i < chosen.size(); i += 2) {
            LinearLayout row = U.linear(ctx, LinearLayout.HORIZONTAL);
            row.addView(kpiCell(chosen.get(i)), U.lp(0, U.WRAP, 1f));
            if (i + 1 < chosen.size()) {
                LinearLayout.LayoutParams p = U.lp(0, U.WRAP, 1f);
                p.setMargins(U.dp(ctx, 10), 0, 0, 0);
                row.addView(kpiCell(chosen.get(i + 1)), p);
            } else {
                row.addView(new View(ctx), U.lp(0, 1, 1f));
            }
            grid.addView(row, U.lpWith(ctx, U.MATCH, U.WRAP, 0, 0, 0, 10));
        }
        body.addView(grid, U.lpWith(ctx, U.MATCH, U.WRAP, 0, 0, 0, 2));
    }

    private View kpiCell(JSONObject kpi) {
        LinearLayout card = U.card(ctx);
        card.setMinimumHeight(U.dp(ctx, 82));
        card.addView(U.tv(ctx, kpi.optString("label", "指标"), 11.5f, U.MUTED, false));

        LinearLayout valueRow = U.linear(ctx, LinearLayout.HORIZONTAL);
        valueRow.setGravity(Gravity.BOTTOM);
        String status = kpi.optString("status", "ok");
        int color = U.INK;
        if ("risk".equals(status)) color = U.DANGER;
        else if ("attention".equals(status)) color = U.WARN;
        else if ("pending".equals(status)) color = U.MUTED;
        String display = Json.str(kpi, "display", "");
        String shownValue = display.length() > 0
                ? display : U.num(kpi.optDouble("value", 0), kpi.optInt("digits", 2));
        TextView value = U.tv(ctx, shownValue, 23, color, true);
        value.setSingleLine(true);
        valueRow.addView(value);
        String unit = kpi.optString("unit", "");
        if (display.length() == 0 && unit.length() > 0) {
            TextView unitView = U.tv(ctx, unit, 10.5f, U.MUTED, false);
            unitView.setPadding(U.dp(ctx, 3), 0, 0, U.dp(ctx, 3));
            valueRow.addView(unitView);
        }
        card.addView(valueRow, U.lpWith(ctx, U.MATCH, U.WRAP, 0, 2, 0, 0));

        String hint = "manual".equals(kpi.optString("source")) && display.length() == 0 ? "人工化验" : "";
        if (hint.length() > 0) {
            TextView h = U.tv(ctx, hint, 10, U.MUTED2, false);
            h.setSingleLine(true);
            h.setEllipsize(TextUtils.TruncateAt.END);
            card.addView(h, U.lpWith(ctx, U.MATCH, U.WRAP, 0, 3, 0, 0));
        }
        return card;
    }

    /* ------------------------------ 数据健康 ------------------------------ */

    private void buildHealth(JSONObject health) {
        LinearLayout card = U.cardFlat(ctx);
        LinearLayout row = U.linear(ctx, LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.addView(U.dot(ctx, "connected".equals(health.optString("gateway")) ? U.OK : U.DANGER, 7));
        int total = health.optInt("pointsTotal", 0);
        int online = health.optInt("pointsOnline", 0);
        int delay = health.optInt("delaySec", 0);
        String text = "数据健康 · 点位在线 " + online + "/" + total + " · 延迟 " + delay + " 秒";
        TextView t = U.tv(ctx, text, 11, U.INK2, false);
        t.setSingleLine(true);
        t.setEllipsize(TextUtils.TruncateAt.END);
        row.addView(t, U.lpWith(ctx, 0, U.WRAP, 8, 0, 0, 0));
        card.addView(row);
        addCard(card);
    }

    /* ------------------------------ 工艺单元 ------------------------------ */

    private void buildProcess(JSONArray process) {
        addSection("工艺单元", "共 " + process.length() + " 个", null);
        HorizontalScrollView scroll = new HorizontalScrollView(ctx);
        scroll.setHorizontalScrollBarEnabled(false);
        scroll.setClipToPadding(false);
        LinearLayout strip = U.linear(ctx, LinearLayout.HORIZONTAL);
        for (int i = 0; i < process.length(); i++) {
            JSONObject unit = process.optJSONObject(i);
            if (unit == null) continue;
            LinearLayout.LayoutParams p = U.lp(U.dp(ctx, 150), U.WRAP);
            p.setMargins(0, 0, U.dp(ctx, 8), 0);
            strip.addView(unitCard(unit), p);
        }
        scroll.addView(strip, new HorizontalScrollView.LayoutParams(U.WRAP, U.WRAP));
        body.addView(scroll, U.lpWith(ctx, U.MATCH, U.WRAP, 0, 0, 0, 12));
        stripView = scroll;
        final int x = stripX;
        if (x > 0) {
            scroll.post(new Runnable() {
                @Override
                public void run() {
                    scroll.scrollTo(x, 0);
                }
            });
        }
    }

    private View unitCard(final JSONObject unit) {
        LinearLayout card = U.linear(ctx, LinearLayout.VERTICAL);
        card.setBackgroundResource(R.drawable.bg_card_soft);
        U.pad(card, ctx, 10, 9, 10, 10);
        card.setMinimumHeight(U.dp(ctx, 132));
        card.setClickable(true);

        String status = unit.optString("status", "normal");
        LinearLayout head = U.linear(ctx, LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.CENTER_VERTICAL);
        head.addView(U.dot(ctx, U.statusFg(status), 7));
        TextView name = U.tv(ctx, unit.optString("name", "-"), 12.5f, U.INK, true);
        name.setSingleLine(true);
        name.setEllipsize(TextUtils.TruncateAt.END);
        head.addView(name, U.lpWith(ctx, 0, U.WRAP, 6, 0, 0, 0));
        card.addView(head);

        TextView chip = U.chip(ctx, U.processStatusName(status), U.statusFg(status), U.statusBg(status));
        card.addView(chip, U.lpWith(ctx, U.WRAP, U.WRAP, 0, 6, 0, 0));

        JSONArray readings = unit.optJSONArray("readings");
        if (readings == null || readings.length() == 0) {
            card.addView(U.tv(ctx, "未接入在线仪表", 10.5f, U.MUTED2, false),
                    U.lpWith(ctx, U.MATCH, U.WRAP, 0, 9, 0, 0));
        } else {
            for (int i = 0; i < readings.length() && i < 2; i++) {
                JSONObject r = readings.optJSONObject(i);
                if (r == null) continue;
                LinearLayout line = U.linear(ctx, LinearLayout.VERTICAL);
                TextView rn = U.tv(ctx, r.optString("name", ""), 9.5f, U.MUTED, false);
                rn.setSingleLine(true);
                rn.setEllipsize(TextUtils.TruncateAt.END);
                line.addView(rn);
                TextView rv = U.tv(ctx, U.valueWithUnit(r.optDouble("value", 0), r.optString("unit", "")),
                        12.5f, U.INK, true);
                rv.setSingleLine(true);
                line.addView(rv);
                card.addView(line, U.lpWith(ctx, U.MATCH, U.WRAP, 0, i == 0 ? 9 : 6, 0, 0));
            }
        }

        JSONObject devices = unit.optJSONObject("devices");
        int alarms = unit.optInt("alarms", 0);
        LinearLayout bottom = U.linear(ctx, LinearLayout.HORIZONTAL);
        bottom.setGravity(Gravity.CENTER_VERTICAL);
        if (devices != null) {
            bottom.addView(U.tv(ctx, "在线 " + devices.optInt("online") + "/" + devices.optInt("total"),
                    9.5f, U.MUTED2, false), U.lp(0, U.WRAP, 1f));
        }
        if (alarms > 0) {
            bottom.addView(U.chip(ctx, "告警 " + alarms, U.DANGER, R.drawable.bg_chip_danger));
        }
        card.addView(bottom, U.lpWith(ctx, U.MATCH, U.WRAP, 0, 8, 0, 0));

        card.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showUnitDialog(unit);
            }
        });
        return card;
    }

    private void showUnitDialog(JSONObject unit) {
        ScrollViewWithContent holder = new ScrollViewWithContent();
        LinearLayout root = holder.root;
        LinearLayout top = U.linear(ctx, LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.addView(U.chip(ctx, U.processStatusName(unit.optString("status", "normal")),
                U.statusFg(unit.optString("status", "normal")), U.statusBg(unit.optString("status", "normal"))));
        if (unit.optInt("alarms", 0) > 0) {
            top.addView(U.chip(ctx, "告警 " + unit.optInt("alarms"), U.DANGER, R.drawable.bg_chip_danger),
                    U.lpWith(ctx, U.WRAP, U.WRAP, 6, 0, 0, 0));
        }
        root.addView(top);
        root.addView(U.tv(ctx, unit.optString("name", "工艺单元"), 17, U.INK, true),
                U.lpWith(ctx, U.MATCH, U.WRAP, 0, 8, 0, 8));

        JSONObject devices = unit.optJSONObject("devices");
        if (devices != null) {
            root.addView(U.kv(ctx, "设备", "在线 " + devices.optInt("online") + " / 共 "
                    + devices.optInt("total") + "（已装 " + devices.optInt("installed") + "）"));
        }
        JSONArray readings = unit.optJSONArray("readings");
        if (readings != null && readings.length() > 0) {
            root.addView(U.tv(ctx, "关键读数", 12, U.MUTED, true),
                    U.lpWith(ctx, U.MATCH, U.WRAP, 0, 6, 0, 2));
            for (int i = 0; i < readings.length(); i++) {
                JSONObject r = readings.optJSONObject(i);
                if (r == null) continue;
                String quality = r.optString("quality", "");
                String value = U.valueWithUnit(r.optDouble("value", 0), r.optString("unit", ""));
                if (r.optBoolean("stale")) value += "（数据滞后）";
                else if (quality.length() > 0 && !"good".equals(quality)) value += "（" + quality + "）";
                root.addView(U.kv(ctx, r.optString("name", r.optString("code", "读数")), value));
            }
        } else {
            root.addView(U.tv(ctx, "该单元未接入在线仪表。", 12.5f, U.MUTED, false),
                    U.lpWith(ctx, U.MATCH, U.WRAP, 0, 8, 0, 0));
        }
        U.dialog(host, holder.scroll);
    }

    /** 简单的“滚动内容 + 对话框”包装。 */
    private class ScrollViewWithContent {
        final LinearLayout root;
        final android.widget.ScrollView scroll;

        ScrollViewWithContent() {
            root = U.dialogContent(ctx);
            scroll = U.dialogScroll(ctx, root);
        }
    }

    /* ------------------------------ 最近告警 ------------------------------ */

    private void buildRecentAlarms(JSONArray alarms) {
        addSection("最近告警", "查看全部 ›", new Runnable() {
            @Override
            public void run() {
                host.selectTabForPage(1);
            }
        });
        if (alarms == null || alarms.length() == 0) {
            showEmpty("当前没有活动告警，站点运行平稳。");
            return;
        }
        LinearLayout list = card();
        int count = Math.min(3, alarms.length());
        for (int i = 0; i < count; i++) {
            JSONObject alarm = alarms.optJSONObject(i);
            if (alarm == null) continue;
            if (i > 0) list.addView(U.divider(ctx, U.LINE), U.lpWith(ctx, U.MATCH,
                    Math.max(1, U.dp(ctx, 0.7f)), 0, 8, 0, 8));
            list.addView(alarmRow(alarm));
        }
        addCard(list);
    }

    private View alarmRow(final JSONObject alarm) {
        LinearLayout row = U.linear(ctx, LinearLayout.HORIZONTAL);
        row.setClickable(true);
        View bar = new View(ctx);
        bar.setBackgroundColor(U.levelFg(alarm.optString("level", "info")));
        row.addView(bar, U.lp(U.dp(ctx, 3), U.MATCH));

        LinearLayout content = U.linear(ctx, LinearLayout.VERTICAL);
        U.pad(content, ctx, 10, 0, 0, 0);
        LinearLayout top = U.linear(ctx, LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.addView(U.chip(ctx, U.levelName(alarm.optString("level", "info")),
                U.levelFg(alarm.optString("level", "info")), U.levelBg(alarm.optString("level", "info"))));
        top.addView(new View(ctx), U.lp(0, 1, 1f));
        top.addView(U.tv(ctx, U.ago(alarm.optString("lastAt")), 10, U.MUTED2, false));
        content.addView(top);

        TextView title = U.tv(ctx, alarm.optString("title", "告警"), 13.5f, U.INK, true);
        title.setMaxLines(2);
        content.addView(title, U.lpWith(ctx, U.MATCH, U.WRAP, 0, 5, 0, 0));

        String point = alarm.optString("pointName", "");
        String value = U.valueWithUnit(alarm.optDouble("value", 0), alarm.optString("unit", ""));
        StringBuilder meta = new StringBuilder();
        if (point.length() > 0) meta.append(point);
        if (value.length() > 0) {
            if (meta.length() > 0) meta.append(" · ");
            meta.append("当前 ").append(value);
        }
        content.addView(U.tv(ctx, meta.toString(), 11, U.MUTED, false),
                U.lpWith(ctx, U.MATCH, U.WRAP, 0, 4, 0, 0));
        row.addView(content, U.lp(0, U.WRAP, 1f));

        row.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                AlarmsPage.showDetail(host, alarm, new Runnable() {
                    @Override
                    public void run() {
                        load();
                    }
                });
            }
        });
        return row;
    }
}
