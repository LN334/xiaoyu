package com.ln334.zhifuwater;

import android.app.Activity;
import android.app.Dialog;
import android.content.Context;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 二级页面内容：水质化验、设备台账、智能诊断。
 * 全部读取同一套接口（服务器模式与本机模式返回结构一致），因此不用区分数据来源。
 */
final class SubPages {

    private final Activity act;
    private final Context ctx;
    private final LinearLayout body;
    private final Session session;
    private String labFilter = "";

    SubPages(Activity act, LinearLayout body) {
        this.act = act;
        this.ctx = act;
        this.body = body;
        this.session = Session.of(act);
    }

    void build(String kind) {
        if (SubActivity.KIND_QUALITY.equals(kind)) {
            loadQuality();
        } else if (SubActivity.KIND_DEVICES.equals(kind)) {
            loadDevices();
        } else {
            loadDiagnosis();
        }
    }

    private String siteId() {
        return session.siteId();
    }

    private void loading() {
        body.removeAllViews();
        LinearLayout card = U.card(ctx);
        card.addView(U.tv(ctx, "正在加载…", 12, U.MUTED, false));
        U.addCard(body, card, ctx, 10);
    }

    private void error(String msg) {
        body.removeAllViews();
        LinearLayout card = U.card(ctx);
        card.addView(U.tv(ctx, "加载失败", 14, U.DANGER, true));
        card.addView(U.tv(ctx, msg == null ? "未知错误" : msg, 12, U.INK2, false),
                U.lpWith(ctx, U.MATCH, U.WRAP, 0, 6, 0, 0));
        TextView retry = U.ghostButton(ctx, "重新加载");
        retry.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                build(kind);
            }
        });
        card.addView(retry, U.lpWith(ctx, U.dp(ctx, 124), U.dp(ctx, 40), 0, 12, 0, 0));
        U.addCard(body, card, ctx, 10);
    }

    private String kind = SubActivity.KIND_QUALITY;

    /* ============================== 水质化验 ============================== */

    private void loadQuality() {
        kind = SubActivity.KIND_QUALITY;
        loading();
        Api.get(ctx, "/api/lab/stats?siteId=" + siteId() + "&days=30", new Api.Cb() {
            @Override
            public void done(JSONObject root, String err) {
                if (err != null) {
                    error(err);
                    return;
                }
                final JSONObject stats = root == null ? null : root.optJSONObject("data");
                Api.get(ctx, "/api/lab?siteId=" + siteId() + (labFilter.length() == 0 ? "" : "&status=" + labFilter), new Api.Cb() {
                    @Override
                    public void done(JSONObject root2, String err2) {
                        if (err2 != null) {
                            error(err2);
                            return;
                        }
                        JSONArray list = root2 == null ? null : root2.optJSONArray("data");
                        renderQuality(stats, list);
                    }
                });
            }
        });
    }

    private void renderQuality(JSONObject stats, JSONArray list) {
        body.removeAllViews();
        int total = stats == null ? 0 : stats.optInt("total");
        int pending = stats == null ? 0 : stats.optInt("pending");
        int reviewed = stats == null ? 0 : stats.optInt("reviewed");

        LinearLayout chips = U.linear(ctx, LinearLayout.HORIZONTAL);
        chips.addView(U.chip(ctx, "化验 " + total, U.INK2, R.drawable.bg_chip_neutral));
        LinearLayout.LayoutParams gap = U.lp(U.WRAP, U.WRAP);
        gap.setMargins(U.dp(ctx, 8), 0, 0, 0);
        chips.addView(U.chip(ctx, "待复核 " + pending, U.WARN, R.drawable.bg_chip_warn), gap);
        LinearLayout.LayoutParams gap2 = U.lp(U.WRAP, U.WRAP);
        gap2.setMargins(U.dp(ctx, 8), 0, 0, 0);
        chips.addView(U.chip(ctx, "已复核 " + reviewed, U.OK, R.drawable.bg_chip_ok), gap2);
        body.addView(chips, U.lpWith(ctx, U.MATCH, U.WRAP, 0, 0, 0, 12));

        JSONArray metrics = stats == null ? null : stats.optJSONArray("metrics");
        if (metrics != null && metrics.length() > 0) {
            U.addCard(body, metricCard(metrics), ctx, 10);
        }

        LinearLayout filters = U.linear(ctx, LinearLayout.HORIZONTAL);
        filters.addView(filterChip("全部", ""));
        filters.addView(filterChip("待复核", "pending_review"), U.lpWith(ctx, U.WRAP, U.WRAP, 8, 0, 0, 0));
        filters.addView(filterChip("已复核", "reviewed"), U.lpWith(ctx, U.WRAP, U.WRAP, 8, 0, 0, 0));
        body.addView(filters, U.lpWith(ctx, U.MATCH, U.WRAP, 0, 2, 0, 10));

        if (list == null || list.length() == 0) {
            LinearLayout card = U.card(ctx);
            TextView t = U.tv(ctx, "没有符合条件的化验记录", 12.5f, U.MUTED, false);
            t.setGravity(Gravity.CENTER);
            t.setPadding(0, U.dp(ctx, 18), 0, U.dp(ctx, 18));
            card.addView(t);
            U.addCard(body, card, ctx, 10);
            return;
        }
        for (int i = 0; i < list.length(); i++) {
            JSONObject r = list.optJSONObject(i);
            if (r != null) U.addCard(body, labCard(r), ctx, 10);
        }
    }

    private View filterChip(final String label, final String status) {
        boolean active = status.equals(labFilter);
        TextView chip = U.tv(ctx, label, 12, active ? U.BRAND : U.INK2, active);
        chip.setBackground(U.roundBg(ctx, active ? U.BRAND_BG : 0xFFFFFFFF, 14));
        chip.setPadding(U.dp(ctx, 14), U.dp(ctx, 7), U.dp(ctx, 14), U.dp(ctx, 7));
        chip.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                labFilter = status;
                loadQuality();
            }
        });
        return chip;
    }

    private View metricCard(JSONArray metrics) {
        LinearLayout card = U.card(ctx);
        card.addView(U.tv(ctx, "主要指标（近 30 天）", 14, U.INK, true));

        LinearLayout head = U.linear(ctx, LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.CENTER_VERTICAL);
        U.pad(head, ctx, 0, 10, 0, 6);
        head.addView(headerCell("指标", 0f), U.lp(0, U.WRAP, 1.1f));
        head.addView(headerCell("进水", 0f), U.lp(0, U.WRAP, 1f));
        head.addView(headerCell("出水", 0f), U.lp(0, U.WRAP, 1f));
        head.addView(headerCell("去除率", 0f), U.lp(0, U.WRAP, 1f));
        head.addView(headerCell("达标率", 0f), U.lp(0, U.WRAP, 1f));
        card.addView(head);

        for (int i = 0; i < metrics.length(); i++) {
            JSONObject m = metrics.optJSONObject(i);
            if (m == null) continue;
            LinearLayout row = U.linear(ctx, LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            U.pad(row, ctx, 0, 8, 0, 8);
            if (i > 0) row.setBackgroundColor(0x08FFFFFF);
            row.addView(valueCell(m.optString("name"), U.INK, true), U.lp(0, U.WRAP, 1.1f));
            row.addView(valueCell(cellNum(m, "inlet"), U.INK2, false), U.lp(0, U.WRAP, 1f));
            row.addView(valueCell(cellNum(m, "outlet"), U.INK2, false), U.lp(0, U.WRAP, 1f));
            double removal = m.optDouble("removal", -1);
            row.addView(valueCell(removal < 0 ? "—" : U.num(removal * 100, 1) + "%", removal < 0 ? U.MUTED2 : U.BRAND, false),
                    U.lp(0, U.WRAP, 1f));
            double rate = m.optDouble("rate", -1);
            row.addView(valueCell(rate < 0 ? "—" : U.num(rate, 0) + "%", rate < 100 ? U.WARN : U.OK, false),
                    U.lp(0, U.WRAP, 1f));
            if (i > 0) card.addView(U.divider(ctx, U.LINE));
            card.addView(row);
        }
        return card;
    }

    private String cellNum(JSONObject m, String key) {
        if (!m.has(key) || m.isNull(key)) return "—";
        return U.num(m.optDouble(key, 0), 2);
    }

    private TextView headerCell(String text, float unused) {
        return U.tv(ctx, text, 10.5f, U.MUTED2, false);
    }

    private TextView valueCell(String text, int color, boolean bold) {
        return U.tv(ctx, text, 12, color, bold);
    }

    private View labCard(final JSONObject r) {
        LinearLayout card = U.card(ctx);
        boolean pending = "pending_review".equals(r.optString("status"));

        LinearLayout top = U.linear(ctx, LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.addView(U.tv(ctx, r.optString("samplePointName", r.optString("samplePoint")), 13.5f, U.INK, true),
                U.lp(0, U.WRAP, 1f));
        top.addView(U.chip(ctx, pending ? "待复核" : "已复核",
                pending ? U.WARN : U.OK, pending ? R.drawable.bg_chip_warn : R.drawable.bg_chip_ok));
        card.addView(top);

        String who = r.optString("operatorName");
        card.addView(U.tv(ctx, U.timeShort(r.optString("sampledAt")) + " 采样" + (who.length() > 0 ? " · " + who : ""),
                10.5f, U.MUTED2, false), U.lpWith(ctx, U.WRAP, U.WRAP, 0, 5, 0, 0));

        JSONObject m = r.optJSONObject("metrics");
        if (m != null) {
            LinearLayout grid = U.linear(ctx, LinearLayout.HORIZONTAL);
            grid.addView(metricCell("COD", m, "COD", 2), U.lp(0, U.WRAP, 1f));
            grid.addView(metricCell("氨氮", m, "NH3N", 2), U.lp(0, U.WRAP, 1f));
            grid.addView(metricCell("总氮", m, "TN", 2), U.lp(0, U.WRAP, 1f));
            grid.addView(metricCell("总磷", m, "TP", 2), U.lp(0, U.WRAP, 1f));
            grid.addView(metricCell("SS", m, "SS", 1), U.lp(0, U.WRAP, 1f));
            card.addView(grid, U.lpWith(ctx, U.MATCH, U.WRAP, 0, 10, 0, 0));
        }

        if (pending) {
            TextView btn = U.smallPrimary(ctx, "复核通过");
            btn.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    review(r.optString("id"));
                }
            });
            card.addView(btn, U.lpWith(ctx, U.dp(ctx, 96), U.dp(ctx, 32), 0, 10, 0, 0));
        } else {
            String reviewer = r.optString("reviewerName");
            card.addView(U.tv(ctx, "复核人 " + (reviewer.length() == 0 ? "—" : reviewer), 10.5f, U.MUTED2, false),
                    U.lpWith(ctx, U.WRAP, U.WRAP, 0, 8, 0, 0));
        }
        return card;
    }

    private View metricCell(String label, JSONObject m, String key, int digits) {
        LinearLayout col = U.linear(ctx, LinearLayout.VERTICAL);
        col.addView(U.tv(ctx, label, 10, U.MUTED2, false));
        String text = m.has(key) && !m.isNull(key) ? U.num(m.optDouble(key, 0), digits) : "—";
        col.addView(U.tv(ctx, text, 13, U.INK2, true), U.lpWith(ctx, U.WRAP, U.WRAP, 0, 3, 0, 0));
        return col;
    }

    private void review(final String id) {
        U.confirm(act, "复核化验记录", "确认该记录数据无误并标记为已复核？", "复核通过", new Runnable() {
            @Override
            public void run() {
                Api.post(ctx, "/api/lab/" + id + "/review", new JSONObject(), new Api.Cb() {
                    @Override
                    public void done(JSONObject root, String err) {
                        if (err != null) {
                            U.toast(ctx, err);
                            return;
                        }
                        U.toast(ctx, "已复核");
                        loadQuality();
                    }
                });
            }
        });
    }

    /* ============================== 设备台账 ============================== */

    private void loadDevices() {
        kind = SubActivity.KIND_DEVICES;
        loading();
        Api.get(ctx, "/api/devices?siteId=" + siteId(), new Api.Cb() {
            @Override
            public void done(JSONObject root, String err) {
                if (err != null) {
                    error(err);
                    return;
                }
                renderDevices(root == null ? null : root.optJSONArray("data"));
            }
        });
    }

    private void renderDevices(JSONArray list) {
        body.removeAllViews();
        if (list == null) list = new JSONArray();
        int online = 0;
        int attention = 0;
        for (int i = 0; i < list.length(); i++) {
            JSONObject d = list.optJSONObject(i);
            if (d == null) continue;
            if (d.optBoolean("online", true)) online++;
            if (d.optInt("health", 100) < 85) attention++;
        }
        LinearLayout chips = U.linear(ctx, LinearLayout.HORIZONTAL);
        chips.addView(U.chip(ctx, "全部 " + list.length(), U.INK2, R.drawable.bg_chip_neutral));
        LinearLayout.LayoutParams g1 = U.lp(U.WRAP, U.WRAP);
        g1.setMargins(U.dp(ctx, 8), 0, 0, 0);
        chips.addView(U.chip(ctx, "在线 " + online, U.OK, R.drawable.bg_chip_ok), g1);
        if (attention > 0) {
            LinearLayout.LayoutParams g2 = U.lp(U.WRAP, U.WRAP);
            g2.setMargins(U.dp(ctx, 8), 0, 0, 0);
            chips.addView(U.chip(ctx, "需关注 " + attention, U.WARN, R.drawable.bg_chip_warn), g2);
        }
        body.addView(chips, U.lpWith(ctx, U.MATCH, U.WRAP, 0, 0, 0, 12));

        if (list.length() == 0) {
            LinearLayout card = U.card(ctx);
            card.addView(U.tv(ctx, "当前站点没有设备台账。", 12.5f, U.MUTED, false));
            U.addCard(body, card, ctx, 10);
            return;
        }
        for (int i = 0; i < list.length(); i++) {
            JSONObject d = list.optJSONObject(i);
            if (d != null) U.addCard(body, deviceCard(d), ctx, 10);
        }
    }

    private View deviceCard(final JSONObject d) {
        LinearLayout card = U.card(ctx);
        int health = d.optInt("health", 100);
        LinearLayout top = U.linear(ctx, LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.addView(U.tv(ctx, d.optString("name", "设备"), 13.5f, U.INK, true), U.lp(0, U.WRAP, 1f));
        top.addView(U.chip(ctx, d.optBoolean("online", true) ? "在线" : "离线",
                d.optBoolean("online", true) ? U.OK : U.MUTED,
                d.optBoolean("online", true) ? R.drawable.bg_chip_ok : R.drawable.bg_chip_neutral));
        card.addView(top);

        String unit = d.optString("unitName");
        if (unit.length() == 0) unit = d.optString("unitCode");
        String meta = d.optString("code") + " · " + U.deviceTypeName(d.optString("type"))
                + " · " + unit;
        card.addView(U.tv(ctx, meta, 10.5f, U.MUTED2, false), U.lpWith(ctx, U.WRAP, U.WRAP, 0, 5, 0, 0));

        LinearLayout healthRow = U.linear(ctx, LinearLayout.HORIZONTAL);
        healthRow.setGravity(Gravity.CENTER_VERTICAL);
        healthRow.addView(U.tv(ctx, "健康度", 10.5f, U.MUTED2, false));
        LinearLayout bar = U.linear(ctx, LinearLayout.HORIZONTAL);
        bar.setBackground(U.roundBg(ctx, U.LINE, 3));
        View filled = new View(ctx);
        filled.setBackground(U.roundBg(ctx, health >= 85 ? U.OK : health >= 70 ? U.WARN : U.DANGER, 3));
        bar.addView(filled, U.lp(0, U.MATCH, Math.max(0.02f, health / 100f)));
        View rest = new View(ctx);
        bar.addView(rest, U.lp(0, U.MATCH, Math.max(0.02f, 1f - health / 100f)));
        LinearLayout.LayoutParams barLp = U.lpWith(ctx, 0, U.dp(ctx, 6), 10, 0, 10, 0);
        barLp.weight = 1f;
        healthRow.addView(bar, barLp);
        healthRow.addView(U.tv(ctx, health + " 分", 11.5f, U.INK2, true));
        card.addView(healthRow, U.lpWith(ctx, U.MATCH, U.WRAP, 0, 10, 0, 0));

        String runtime = "运行 " + U.num(d.optDouble("runtimeHours", 0), 0) + " h"
                + " · 启动 " + d.optInt("starts", 0) + " 次"
                + " · 上次维护 " + (d.optString("lastMaintAt").length() > 0 ? U.dateOnly(d.optString("lastMaintAt")) : "—");
        card.addView(U.tv(ctx, runtime, 10.5f, U.MUTED, false), U.lpWith(ctx, U.WRAP, U.WRAP, 0, 8, 0, 0));

        card.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showDevice(d);
            }
        });
        return card;
    }

    private void showDevice(JSONObject d) {
        LinearLayout content = U.dialogContent(ctx);
        content.addView(U.tv(ctx, d.optString("name"), 16, U.INK, true));
        String unitName = d.optString("unitName");
        if (unitName.length() == 0) unitName = d.optString("unitCode");
        content.addView(U.tv(ctx, d.optString("code") + " · " + unitName, 11, U.MUTED2, false),
                U.lpWith(ctx, U.WRAP, U.WRAP, 0, 4, 0, 10));
        String[][] rows = {
                {"型号规格", d.optString("model") + " / " + d.optString("spec")},
                {"类型", U.deviceTypeName(d.optString("type"))},
                {"通讯", d.optString("protocol")},
                {"PLC 地址", d.optString("plAddress")},
                {"安装日期", d.optString("installDate")},
                {"保修截止", d.optString("warrantyUntil")},
                {"维护周期", d.optInt("maintCycleDays", 180) + " 天"},
                {"上次维护", d.optString("lastMaintAt")},
        };
        for (String[] row : rows) {
            content.addView(U.kv(ctx, row[0], row[1] == null || row[1].length() == 0 ? "—" : row[1]));
        }
        Dialog dialog = U.dialog(act, content);
        content.addView(U.dialogActions(act, "关闭", dialog, null, null),
                U.lpWith(ctx, U.MATCH, U.WRAP, 0, 14, 0, 0));
        dialog.show();
    }

    /* ============================== 智能诊断 ============================== */

    private void loadDiagnosis() {
        kind = SubActivity.KIND_DIAGNOSIS;
        loading();
        Api.get(ctx, "/api/diagnosis?siteId=" + siteId(), new Api.Cb() {
            @Override
            public void done(JSONObject root, String err) {
                if (err != null) {
                    error(err);
                    return;
                }
                renderDiagnosis(root == null ? null : root.optJSONArray("data"));
            }
        });
    }

    private void renderDiagnosis(JSONArray list) {
        body.removeAllViews();
        if (list == null) list = new JSONArray();
        int warning = 0, attention = 0, ok = 0;
        for (int i = 0; i < list.length(); i++) {
            String level = list.optJSONObject(i) == null ? "none" : list.optJSONObject(i).optString("level", "none");
            String tag = levelTag(level);
            if ("warning".equals(tag)) warning++;
            else if ("attention".equals(tag)) attention++;
            else ok++;
        }
        LinearLayout chips = U.linear(ctx, LinearLayout.HORIZONTAL);
        chips.addView(U.chip(ctx, "需处理 " + warning, U.DANGER, R.drawable.bg_chip_danger));
        LinearLayout.LayoutParams g1 = U.lp(U.WRAP, U.WRAP);
        g1.setMargins(U.dp(ctx, 8), 0, 0, 0);
        chips.addView(U.chip(ctx, "需关注 " + attention, U.WARN, R.drawable.bg_chip_warn), g1);
        LinearLayout.LayoutParams g2 = U.lp(U.WRAP, U.WRAP);
        g2.setMargins(U.dp(ctx, 8), 0, 0, 0);
        chips.addView(U.chip(ctx, "正常 " + ok, U.OK, R.drawable.bg_chip_ok), g2);
        body.addView(chips, U.lpWith(ctx, U.MATCH, U.WRAP, 0, 0, 0, 12));

        if (list.length() == 0) {
            LinearLayout card = U.card(ctx);
            card.addView(U.tv(ctx, "暂无诊断结论。", 12.5f, U.MUTED, false));
            U.addCard(body, card, ctx, 10);
            return;
        }
        for (int i = 0; i < list.length(); i++) {
            JSONObject d = list.optJSONObject(i);
            if (d != null) U.addCard(body, diagnosisCard(d), ctx, 10);
        }
    }

    private View diagnosisCard(JSONObject d) {
        String tag = levelTag(d.optString("level", "none"));
        LinearLayout card = U.card(ctx);

        LinearLayout top = U.linear(ctx, LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.addView(U.chip(ctx, levelName(tag), levelFg(tag), levelBgRes(tag)));
        top.addView(U.tv(ctx, U.timeShort(d.optString("generatedAt")), 10, U.MUTED2, false),
                U.lpWith(ctx, U.WRAP, U.WRAP, 8, 0, 0, 0));
        card.addView(top);

        card.addView(U.tv(ctx, d.optString("title"), 14, U.INK, true),
                U.lpWith(ctx, U.MATCH, U.WRAP, 0, 8, 0, 0));

        String phenomenon = d.optString("phenomenon");
        if (phenomenon.length() > 0) {
            card.addView(U.tv(ctx, "现象", 10.5f, U.MUTED2, false), U.lpWith(ctx, U.WRAP, U.WRAP, 0, 9, 0, 3));
            card.addView(wrapText(phenomenon, U.INK2, 12));
        }

        String suggestion = d.optString("suggestion");
        if (suggestion.length() > 0) {
            LinearLayout tip = U.linear(ctx, LinearLayout.VERTICAL);
            tip.setBackground(U.roundBg(ctx, U.WARN_BG, 6));
            U.pad(tip, ctx, 10, 8, 10, 8);
            tip.addView(U.tv(ctx, "建议措施", 10.5f, U.WARN, true));
            tip.addView(wrapText(suggestion, U.INK2, 11.5f), U.lpWith(ctx, U.MATCH, U.WRAP, 0, 4, 0, 0));
            card.addView(tip, U.lpWith(ctx, U.MATCH, U.WRAP, 0, 10, 0, 0));
        }

        final LinearLayout detail = U.linear(ctx, LinearLayout.VERTICAL);
        detail.setVisibility(View.GONE);
        fillDetail(detail, d);
        final TextView toggle = U.tv(ctx, "展开依据与检查项", 11.5f, U.BRAND, false);
        toggle.setPadding(0, U.dp(ctx, 10), 0, U.dp(ctx, 2));
        toggle.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                boolean open = detail.getVisibility() == View.VISIBLE;
                detail.setVisibility(open ? View.GONE : View.VISIBLE);
                toggle.setText(open ? "展开依据与检查项" : "收起");
            }
        });
        card.addView(toggle);
        card.addView(detail);
        return card;
    }

    private void fillDetail(LinearLayout detail, JSONObject d) {
        JSONArray causes = d.optJSONArray("causes");
        if (causes != null && causes.length() > 0) {
            detail.addView(U.tv(ctx, "可能原因", 10.5f, U.MUTED2, false), U.lpWith(ctx, U.WRAP, U.WRAP, 0, 10, 0, 4));
            for (int i = 0; i < causes.length(); i++) {
                detail.addView(bullet("· " + causes.optString(i)));
            }
        }
        JSONArray checks = d.optJSONArray("checks");
        if (checks != null && checks.length() > 0) {
            detail.addView(U.tv(ctx, "建议检查项", 10.5f, U.MUTED2, false), U.lpWith(ctx, U.WRAP, U.WRAP, 0, 10, 0, 4));
            for (int i = 0; i < checks.length(); i++) {
                JSONObject c = checks.optJSONObject(i);
                if (c == null) continue;
                detail.addView(bullet((i + 1) + ". " + c.optString("item") + "：" + c.optString("how")
                        + "（判定 " + c.optString("expect") + "）"));
            }
        }
        JSONObject basis = d.optJSONObject("basis");
        if (basis != null) {
            detail.addView(U.tv(ctx, "判断依据", 10.5f, U.MUTED2, false), U.lpWith(ctx, U.WRAP, U.WRAP, 0, 10, 0, 4));
            JSONArray pts = basis.optJSONArray("points");
            if (pts != null) {
                for (int i = 0; i < pts.length(); i++) {
                    JSONObject p = pts.optJSONObject(i);
                    if (p == null) continue;
                    detail.addView(bullet("· " + p.optString("name") + " " + U.num(p.optDouble("value", 0), 2)
                            + " " + p.optString("unit") + "（" + p.optString("time") + "）"));
                }
            }
            detail.addView(bullet("· 趋势：" + basis.optString("trend")));
            detail.addView(bullet("· " + basis.optString("rule")));
        }
        String boundary = d.optString("boundary");
        if (boundary.length() > 0) {
            detail.addView(U.tv(ctx, "边界条件", 10.5f, U.MUTED2, false), U.lpWith(ctx, U.WRAP, U.WRAP, 0, 10, 0, 4));
            detail.addView(wrapText(boundary, U.DANGER, 11.5f));
        }
    }

    private TextView bullet(String text) {
        TextView t = U.tv(ctx, text, 11.5f, U.INK2, false);
        t.setLineSpacing(U.dp(ctx, 2), 1f);
        t.setPadding(0, U.dp(ctx, 2), 0, U.dp(ctx, 2));
        return t;
    }

    private TextView wrapText(String text, int color, float sp) {
        TextView t = U.tv(ctx, text, sp, color, false);
        t.setLineSpacing(U.dp(ctx, 2.5f), 1f);
        return t;
    }

    private static String levelTag(String level) {
        if ("high".equals(level) || "critical".equals(level)) return "warning";
        if ("medium".equals(level) || "low".equals(level)) return "attention";
        if ("none".equals(level) || "ok".equals(level)) return "ok";
        return "attention";
    }

    private static String levelName(String tag) {
        if ("warning".equals(tag)) return "需处理";
        if ("ok".equals(tag)) return "正常";
        return "需关注";
    }

    private static int levelFg(String tag) {
        if ("warning".equals(tag)) return U.DANGER;
        if ("ok".equals(tag)) return U.OK;
        return U.WARN;
    }

    private static int levelBgRes(String tag) {
        if ("warning".equals(tag)) return R.drawable.bg_chip_danger;
        if ("ok".equals(tag)) return R.drawable.bg_chip_ok;
        return R.drawable.bg_chip_warn;
    }
}
