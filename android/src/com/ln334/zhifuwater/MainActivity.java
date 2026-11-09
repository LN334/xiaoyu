package com.ln334.zhifuwater;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Typeface;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 主界面：统一头部（站点/刷新）+ 五个 Tab（总览 / 告警 / 工单 / 巡检 / 我的）。
 */
public class MainActivity extends Activity {

    private static final int TAB_COUNT = 5;

    private Session session;
    private final BasePage[] pages = new BasePage[TAB_COUNT];
    private final LinearLayout[] tabItems = new LinearLayout[TAB_COUNT];
    private final GlyphView[] tabGlyphs = new GlyphView[TAB_COUNT];
    private final TextView[] tabLabels = new TextView[TAB_COUNT];

    private static final int[] TAB_GLYPHS = {
            GlyphView.OVERVIEW, GlyphView.MONITOR, GlyphView.ALARM,
            GlyphView.WORKORDER, GlyphView.MORE
    };
    private static final int[] TAB_TEXT = {
            R.string.tab_overview, R.string.tab_monitor, R.string.tab_alarms,
            R.string.tab_workorders, R.string.tab_more
    };

    private TextView siteNameView;
    private ProgressBar progress;
    private FrameLayout content;
    private int current = -1;
    private int busyCount = 0;
    private JSONArray sitesCache;
    private LocalEngine.Listener engineListener;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        session = Session.of(this);
        if (!session.isLoggedIn()) {
            goLogin();
            return;
        }
        Api.onUnauthorized = new Runnable() {
            @Override
            public void run() {
                handleUnauthorized();
            }
        };
        buildUi();
        selectTab(0);
        loadSiteName();
    }

    /* ------------------------------ 界面搭建 ------------------------------ */

    private void buildUi() {
        LinearLayout root = U.linear(this, LinearLayout.VERTICAL);
        root.setBackgroundColor(U.BG);
        root.addView(buildHeader(), U.lp(U.MATCH, U.WRAP));

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setIndeterminate(true);
        progress.setVisibility(View.GONE);
        root.addView(progress, U.lp(U.MATCH, U.dp(this, 3)));

        content = new FrameLayout(this);
        content.setBackgroundColor(U.BG);
        root.addView(content, U.lp(U.MATCH, 0, 1f));

        root.addView(buildTabBar(), U.lp(U.MATCH, U.WRAP));
        setContentView(root);
    }

    private View buildHeader() {
        LinearLayout header = U.linear(this, LinearLayout.VERTICAL);
        header.setBackgroundColor(U.WHITE);

        LinearLayout row1 = U.linear(this, LinearLayout.HORIZONTAL);
        row1.setGravity(Gravity.CENTER_VERTICAL);
        row1.setPadding(U.dp(this, 14), U.dp(this, 8), U.dp(this, 12), 0);

        FrameLayout mark = new FrameLayout(this);
        mark.setBackground(U.roundBg(this, U.BRAND_BG, 10));
        GlyphView drop = U.glyph(this, GlyphView.DROP, 17, U.BRAND);
        FrameLayout.LayoutParams dropLp = new FrameLayout.LayoutParams(U.dp(this, 17), U.dp(this, 17));
        dropLp.gravity = Gravity.CENTER;
        mark.addView(drop, dropLp);
        row1.addView(mark, U.lp(U.dp(this, 32), U.dp(this, 32)));

        LinearLayout titles = U.linear(this, LinearLayout.VERTICAL);
        titles.setPadding(U.dp(this, 9), 0, 0, 0);
        titles.addView(U.tv(this, "小禹", 16, U.INK, true));
        titles.addView(U.tv(this, "智慧水处理平台 · 移动端", 9.5f, U.MUTED2, false),
                U.lpWith(this, U.MATCH, U.WRAP, 0, 2, 0, 0));
        row1.addView(titles, U.lp(0, U.WRAP, 1f));

        TextView modeBadge = U.chip(this, session.isLocal() ? "本机演示" : "服务器",
                session.isLocal() ? U.BRAND : U.MUTED, R.drawable.bg_chip_brand);
        row1.addView(modeBadge, U.lpWith(this, U.WRAP, U.WRAP, 0, 0, 8, 0));

        FrameLayout refresh = new FrameLayout(this);
        refresh.setBackground(U.roundBg(this, U.BRAND_BG, 13));
        refresh.setClickable(true);
        refresh.setFocusable(true);
        GlyphView refreshGlyph = U.glyph(this, GlyphView.REFRESH, 19, U.BRAND);
        FrameLayout.LayoutParams rlp = new FrameLayout.LayoutParams(U.dp(this, 19), U.dp(this, 19));
        rlp.gravity = Gravity.CENTER;
        refresh.addView(refreshGlyph, rlp);
        refresh.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                refreshCurrentPage();
            }
        });
        row1.addView(refresh, U.lp(U.dp(this, 48), U.dp(this, 48)));
        header.addView(row1);

        LinearLayout row2 = U.linear(this, LinearLayout.HORIZONTAL);
        row2.setGravity(Gravity.CENTER_VERTICAL);
        row2.setPadding(U.dp(this, 14), U.dp(this, 0), U.dp(this, 14), U.dp(this, 8));
        row2.setMinimumHeight(U.dp(this, 44));
        row2.setClickable(true);
        row2.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showSitePicker();
            }
        });
        row2.addView(U.dot(this, U.OK, 7));
        siteNameView = U.tv(this, session.siteName(), 13, U.INK, true);
        siteNameView.setSingleLine(true);
        row2.addView(siteNameView, U.lpWith(this, U.WRAP, U.WRAP, 7, 0, 0, 0));
        GlyphView chevron = U.glyph(this, GlyphView.CHEVRON, 15, U.MUTED);
        row2.addView(chevron, U.lpWith(this, U.dp(this, 15), U.dp(this, 15), 4, 0, 0, 0));
        row2.addView(new View(this), U.lp(0, 1, 1f));
        TextView switchHint = U.tv(this, "切换站点", 11.5f, U.MUTED2, false);
        row2.addView(switchHint);
        header.addView(row2);

        header.addView(U.divider(this, U.LINE), U.lp(U.MATCH, U.dp(this, 0.7f)));
        return header;
    }

    private View buildTabBar() {
        LinearLayout wrap = U.linear(this, LinearLayout.VERTICAL);
        wrap.setBackgroundColor(U.WHITE);
        wrap.addView(U.divider(this, U.LINE), U.lp(U.MATCH, Math.max(1, U.dp(this, 0.7f))));

        LinearLayout bar = U.linear(this, LinearLayout.HORIZONTAL);
        bar.setWeightSum(TAB_COUNT);
        bar.setBaselineAligned(false);
        for (int i = 0; i < TAB_COUNT; i++) {
            final int idx = i;
            LinearLayout item = U.linear(this, LinearLayout.VERTICAL);
            item.setGravity(Gravity.CENTER_HORIZONTAL | Gravity.CENTER_VERTICAL);
            item.setPadding(0, U.dp(this, 7), 0, U.dp(this, 5));
            item.setClickable(true);
            item.setFocusable(true);
            item.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    selectTab(idx);
                }
            });

            GlyphView g = U.glyph(this, TAB_GLYPHS[i], 23, U.MUTED2);
            item.addView(g, U.lp(U.dp(this, 23), U.dp(this, 23)));
            TextView label = U.tv(this, getString(TAB_TEXT[i]), 10.5f, U.MUTED2, false);
            label.setPadding(0, U.dp(this, 2), 0, 0);
            label.setGravity(Gravity.CENTER);
            label.setIncludeFontPadding(false);
            label.setMaxLines(1);
            label.setSingleLine(true);
            label.setEllipsize(TextUtils.TruncateAt.END);
            item.addView(label, U.lp(U.MATCH, U.WRAP));

            tabItems[i] = item;
            tabGlyphs[i] = g;
            tabLabels[i] = label;
            bar.addView(item, U.lp(0, U.dp(this, 58), 1f));
        }
        wrap.addView(bar, U.lp(U.MATCH, U.WRAP));
        return wrap;
    }

    /* ------------------------------ Tab 切换 ------------------------------ */

    private BasePage page(int index) {
        if (pages[index] == null) {
            switch (index) {
                case 0:
                    pages[index] = new OverviewPage(this);
                    break;
                case 1:
                    pages[index] = new MonitorPage(this);
                    break;
                case 2:
                    pages[index] = new AlarmsPage(this);
                    break;
                case 3:
                    pages[index] = new WorkordersPage(this);
                    break;
                default:
                    pages[index] = new MorePage(this);
                    break;
            }
        }
        return pages[index];
    }

    private void selectTab(int idx) {
        if (idx < 0 || idx >= TAB_COUNT) return;
        if (idx == current) {
            if (pages[idx] != null) pages[idx].ensureLoaded();
            return;
        }
        current = idx;
        for (int i = 0; i < TAB_COUNT; i++) {
            boolean selected = i == idx;
            tabItems[i].setSelected(selected);
            tabGlyphs[i].setGlyphColor(selected ? U.BRAND : U.MUTED2);
            tabLabels[i].setTextColor(selected ? U.BRAND : U.MUTED2);
            tabLabels[i].setTypeface(selected ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
        }
        BasePage p = page(idx);
        if (idx == 0) p.invalidateData(); // 总览计数需在切回时重新拉取
        content.removeAllViews();
        content.addView(p.view(), new FrameLayout.LayoutParams(U.MATCH, U.MATCH));
        p.ensureLoaded();
        p.view().scrollTo(0, 0);
    }

    /** 供页面内跳转到其它 Tab（例如总览的“查看全部告警”）。 */
    void selectTabForPage(int idx) {
        selectTab(idx);
    }

    private void refreshCurrentPage() {
        if (current < 0) return;
        BasePage p = page(current);
        p.invalidateData();
        p.ensureLoaded();
        U.toast(this, "正在刷新…");
    }

    /* ------------------------------ 加载状态 ------------------------------ */

    void busy(boolean busy) {
        busyCount += busy ? 1 : -1;
        if (busyCount < 0) busyCount = 0;
        if (progress != null) {
            progress.setVisibility(busyCount > 0 ? View.VISIBLE : View.GONE);
        }
    }

    /* ------------------------------ 站点 ------------------------------ */

    String siteId() {
        return session.siteId();
    }

    private void loadSiteName() {
        Api.get(this, "/api/sites", new Api.Cb() {
            @Override
            public void done(JSONObject root, String error) {
                if (error != null || root == null) return;
                JSONArray arr = root.optJSONArray("data");
                if (arr == null) return;
                sitesCache = arr;
                String id = session.siteId();
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject site = arr.optJSONObject(i);
                    if (site != null && id.equals(site.optString("id"))) {
                        String name = site.optString("name", site.optString("shortName", id));
                        session.setSite(id, name);
                        if (siteNameView != null) siteNameView.setText(name);
                        break;
                    }
                }
            }
        });
    }

    private void showSitePicker() {
        if (sitesCache != null) {
            showSiteDialog(sitesCache);
            return;
        }
        busy(true);
        Api.get(this, "/api/sites", new Api.Cb() {
            @Override
            public void done(JSONObject root, String error) {
                busy(false);
                if (error != null) {
                    U.alert(MainActivity.this, "无法获取站点", error, null);
                    return;
                }
                JSONArray arr = root == null ? null : root.optJSONArray("data");
                if (arr == null || arr.length() == 0) {
                    U.toast(MainActivity.this, "没有可用站点");
                    return;
                }
                sitesCache = arr;
                showSiteDialog(arr);
            }
        });
    }

    private void showSiteDialog(final JSONArray sites) {
        LinearLayout root = U.dialogContent(this);
        root.addView(U.tv(this, "切换站点", 17, U.INK, true));
        root.addView(U.tv(this, "切换后各页面会按新站点重新加载", 11.5f, U.MUTED, false),
                U.lpWith(this, U.MATCH, U.WRAP, 0, 5, 0, 10));

        final android.app.Dialog[] holder = new android.app.Dialog[1];
        for (int i = 0; i < sites.length(); i++) {
            final JSONObject site = sites.optJSONObject(i);
            if (site == null) continue;
            final String id = site.optString("id");
            final String name = site.optString("name", id);
            boolean selected = id.equals(session.siteId());

            LinearLayout row = U.linear(this, LinearLayout.VERTICAL);
            row.setBackgroundResource(selected ? R.drawable.bg_site : R.drawable.bg_card);
            row.setPadding(U.dp(this, 14), U.dp(this, 12), U.dp(this, 14), U.dp(this, 12));
            row.setClickable(true);
            row.setMinimumHeight(U.dp(this, 56));

            LinearLayout line1 = U.linear(this, LinearLayout.HORIZONTAL);
            line1.setGravity(Gravity.CENTER_VERTICAL);
            TextView nameView = U.tv(this, name, 14, U.INK, true);
            line1.addView(nameView, U.lp(0, U.WRAP, 1f));
            JSONObject counts = site.optJSONObject("counts");
            if (counts != null) {
                int alarms = counts.optInt("activeAlarms", 0);
                if (alarms > 0) {
                    line1.addView(U.chip(this, "告警 " + alarms, U.DANGER, R.drawable.bg_chip_danger),
                            U.lpWith(this, U.WRAP, U.WRAP, 0, 0, 6, 0));
                }
            }
            if (selected) {
                line1.addView(U.chip(this, "当前", U.BRAND, R.drawable.bg_chip_brand));
            }
            row.addView(line1);

            String region = site.optString("region", "");
            String area = site.optString("area", "");
            String status = U.siteStatusName(site.optString("status", ""));
            StringBuilder sub = new StringBuilder();
            if (region.length() > 0) sub.append(region);
            if (area.length() > 0) {
                if (sub.length() > 0) sub.append(" · ");
                sub.append(area);
            }
            if (sub.length() > 0) sub.append(" · ");
            sub.append(status);
            if (counts != null) {
                sub.append(" · 点位在线 ").append(counts.optInt("onlinePoints")).append("/")
                        .append(counts.optInt("devices", 0));
                sub.append(" · 活动告警 ").append(counts.optInt("activeAlarms")).append(" · 待办工单 ")
                        .append(counts.optInt("openWorkorders"));
            }
            row.addView(U.tv(this, sub.toString(), 11, U.MUTED, false),
                    U.lpWith(this, U.MATCH, U.WRAP, 0, 5, 0, 0));

            row.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    if (holder[0] != null) holder[0].dismiss();
                    if (id.equals(session.siteId())) return;
                    switchSite(id, name);
                }
            });
            root.addView(row, U.lpWith(this, U.MATCH, U.WRAP, 0, 0, 0, 8));
        }
        holder[0] = U.dialog(this, U.dialogScroll(this, root));
    }

    private void switchSite(String id, String name) {
        session.setSite(id, name);
        onSiteChanged();
        U.toast(this, "已切换至 " + name);
    }

    /** 页面内切换站点后由页面调用：同步头部站点名并让所有页面按新站点重载。 */
    void onSiteChanged() {
        if (siteNameView != null) siteNameView.setText(session.siteName());
        for (int i = 0; i < TAB_COUNT; i++) {
            if (pages[i] != null) pages[i].invalidateData();
        }
        if (current >= 0) page(current).ensureLoaded();
    }

    /* ------------------------------ 生命周期与回调 ------------------------------ */

    void handleUnauthorized() {
        Api.onUnauthorized = null;
        session.clearToken();
        U.toast(this, "登录已失效，请重新登录");
        goLogin();
    }

    private void goLogin() {
        Intent intent = new Intent(this, LoginActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(intent);
        finish();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == InspectionsPage.REQ_INSPECT) {
            BasePage p = pages[4];
            if (p != null) {
                p.invalidateData();
                p.ensureLoaded();
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (current > 0) {
            selectTab(0);
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (session != null && session.isLocal()) {
            LocalEngine engine = LocalEngine.get(this);
            engine.addListener(engineListener());
            engine.start();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (session != null && session.isLocal()) {
            LocalEngine engine = LocalEngine.get(this);
            engine.removeListener(engineListener());
            engine.stop();
        }
    }

    /** 本机引擎每次推进后的回调：只让总览与告警页静默刷新。 */
    private LocalEngine.Listener engineListener() {
        if (engineListener == null) {
            engineListener = new LocalEngine.Listener() {
                @Override
                public void onTick(long atMs) {
                    onLocalTick(atMs);
                }
            };
        }
        return engineListener;
    }

    private void onLocalTick(long atMs) {
        if (current != 0 && current != 1) return;
        BasePage p = pages[current];
        if (p != null) p.quietReload();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (Api.onUnauthorized != null) Api.onUnauthorized = null;
        if (session != null && session.isLocal() && engineListener != null) {
            LocalEngine.get(this).removeListener(engineListener);
        }
    }
}
