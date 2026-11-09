package com.ln334.zhifuwater;

import android.content.Intent;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 更多：当前账号、巡检任务、二级页面入口（水质/设备/诊断）、关于。
 * 巡检从底部导航移到这里，仍然可以逐项执行与查看记录。
 */
public class MorePage extends BasePage {

    private JSONObject me;
    private JSONArray sites;
    private JSONArray tasks;

    MorePage(MainActivity host) {
        super(host);
    }

    @Override
    protected String pageTitle() {
        return "更多";
    }

    @Override
    protected String pageSubtitle() {
        return "";
    }

    @Override
    void load() {
        setBusy(true);
        Api.get(ctx, "/api/sites", new Api.Cb() {
            @Override
            public void done(JSONObject root, String error) {
                if (!alive()) return;
                if (error == null && root != null) sites = root.optJSONArray("data");
                loadMe();
            }
        });
    }

    private void loadMe() {
        Api.get(ctx, "/api/auth/me", new Api.Cb() {
            @Override
            public void done(JSONObject root, String error) {
                if (!alive()) return;
                JSONObject data = root == null ? null : root.optJSONObject("data");
                me = data == null ? null : data.optJSONObject("user");
                Api.get(ctx, "/api/inspections?siteId=" + siteId(), new Api.Cb() {
                    @Override
                    public void done(JSONObject root2, String error2) {
                        if (!alive()) return;
                        setBusy(false);
                        if (error2 != null) {
                            showError(error2);
                            return;
                        }
                        tasks = root2 == null ? null : root2.optJSONArray("data");
                        render();
                    }
                });
            }
        });
    }

    private void render() {
        clearBody();
        addHead();
        addCard(accountCard());
        addCard(entryCard());
        addCard(inspectionCard());
        if (sites != null && sites.length() > 0) addCard(siteCard());
        addCard(connectionCard());
        addLogout();
        afterRender();
    }

    private View accountCard() {
        LinearLayout card = card();
        LinearLayout row = U.linear(ctx, LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);

        TextView avatar = U.tv(ctx, initial(session.username()), 16, U.BRAND, true);
        avatar.setGravity(Gravity.CENTER);
        avatar.setBackgroundResource(R.drawable.bg_avatar);
        row.addView(avatar, U.lp(U.dp(ctx, 42), U.dp(ctx, 42)));

        LinearLayout names = U.linear(ctx, LinearLayout.VERTICAL);
        String name = me == null ? session.username() : me.optString("name", session.username());
        String role = me == null ? "" : me.optString("roleName", me.optString("role", ""));
        names.addView(U.tv(ctx, name, 15, U.INK, true));
        names.addView(U.tv(ctx, role.length() == 0 ? "值班人员" : role, 10.5f, U.MUTED2, false),
                U.lpWith(ctx, U.WRAP, U.WRAP, 0, 3, 0, 0));
        LinearLayout.LayoutParams nameLp = U.lp(0, U.WRAP, 1f);
        nameLp.setMargins(U.dp(ctx, 12), 0, U.dp(ctx, 10), 0);
        row.addView(names, nameLp);

        row.addView(U.chip(ctx, session.isLocal() ? "本机" : "联网",
                session.isLocal() ? U.INFO : U.OK,
                session.isLocal() ? R.drawable.bg_chip_info : R.drawable.bg_chip_ok));
        card.addView(row);

        card.addView(U.tv(ctx, session.siteName(), 11.5f, U.MUTED, false),
                U.lpWith(ctx, U.WRAP, U.WRAP, 0, 10, 0, 0));
        return card;
    }

    private String initial(String name) {
        if (name == null || name.length() == 0) return "值";
        return name.substring(0, 1).toUpperCase();
    }

    private View entryCard() {
        LinearLayout card = card();
        card.addView(U.tv(ctx, "功能", 14, U.INK, true));
        addEntry(card, "水质化验", "进出水指标、去除率与复核", SubActivity.KIND_QUALITY);
        addEntry(card, "设备台账", "设备状态、健康度与维护记录", SubActivity.KIND_DEVICES);
        addEntry(card, "智能诊断", "按点位与化验结果给出的处置建议", SubActivity.KIND_DIAGNOSIS);
        return card;
    }

    private void addEntry(LinearLayout card, String title, String sub, final String kind) {
        LinearLayout row = U.linear(ctx, LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        U.pad(row, ctx, 0, 12, 0, 12);

        LinearLayout texts = U.linear(ctx, LinearLayout.VERTICAL);
        texts.addView(U.tv(ctx, title, 14, U.INK, true));
        texts.addView(U.tv(ctx, sub, 10.5f, U.MUTED2, false),
                U.lpWith(ctx, U.WRAP, U.WRAP, 0, 3, 0, 0));
        row.addView(texts, U.lp(0, U.WRAP, 1f));
        row.addView(U.tv(ctx, "›", 18, U.MUTED2, false));

        row.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Intent intent = new Intent(host, SubActivity.class);
                intent.putExtra(SubActivity.EXTRA_KIND, kind);
                host.startActivity(intent);
            }
        });
        card.addView(U.divider(ctx, U.LINE));
        card.addView(row);
    }

    private View inspectionCard() {
        LinearLayout card = card();
        LinearLayout head = U.linear(ctx, LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.CENTER_VERTICAL);
        head.addView(U.tv(ctx, "巡检任务", 14, U.INK, true), U.lp(0, U.WRAP, 1f));
        head.addView(U.tv(ctx, "全部 ›", 11, U.BRAND, false));
        card.addView(head);

        int pending = 0;
        int done = 0;
        if (tasks != null) {
            for (int i = 0; i < tasks.length(); i++) {
                JSONObject t = tasks.optJSONObject(i);
                if (t == null) continue;
                if ("done".equals(t.optString("status"))) done++;
                else pending++;
            }
        }
        LinearLayout chips = U.linear(ctx, LinearLayout.HORIZONTAL);
        chips.addView(U.chip(ctx, "待执行 " + pending, U.WARN, R.drawable.bg_chip_warn));
        LinearLayout.LayoutParams g = U.lp(U.WRAP, U.WRAP);
        g.setMargins(U.dp(ctx, 8), 0, 0, 0);
        chips.addView(U.chip(ctx, "已完成 " + done, U.OK, R.drawable.bg_chip_ok), g);
        card.addView(chips, U.lpWith(ctx, U.WRAP, U.WRAP, 0, 9, 0, 2));

        if (tasks == null || tasks.length() == 0) {
            card.addView(U.tv(ctx, "当前站点暂无巡检任务。", 12, U.MUTED, false),
                    U.lpWith(ctx, U.WRAP, U.WRAP, 0, 10, 0, 2));
            return card;
        }

        int shown = 0;
        for (int i = 0; i < tasks.length() && shown < 3; i++) {
            JSONObject t = tasks.optJSONObject(i);
            if (t == null) continue;
            if (shown > 0) card.addView(U.divider(ctx, U.LINE));
            shown++;
            card.addView(taskRow(t));
        }
        return card;
    }

    private View taskRow(final JSONObject task) {
        boolean isDone = "done".equals(task.optString("status"));
        LinearLayout row = U.linear(ctx, LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        U.pad(row, ctx, 0, 10, 0, 10);

        LinearLayout texts = U.linear(ctx, LinearLayout.VERTICAL);
        texts.addView(U.tv(ctx, task.optString("title", "巡检任务"), 12.5f, U.INK, false));
        String due = task.optString("dueAt");
        String meta = U.inspectionStatusName(task.optString("status", "pending"))
                + (due.length() > 0 ? " · 截止 " + U.timeShort(due) : "");
        texts.addView(U.tv(ctx, meta, 10.5f, U.MUTED2, false),
                U.lpWith(ctx, U.WRAP, U.WRAP, 0, 3, 0, 0));
        row.addView(texts, U.lp(0, U.WRAP, 1f));
        row.addView(U.tv(ctx, isDone ? "查看" : "执行 ›", 11.5f, U.BRAND, false));

        row.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openTask(task.optString("id"), "done".equals(task.optString("status")));
            }
        });
        return row;
    }

    private void openTask(String id, boolean readOnly) {
        if (id == null || id.length() == 0) {
            U.toast(host, "缺少巡检任务编号");
            return;
        }
        Intent intent = new Intent(host, InspectionActivity.class);
        intent.putExtra(InspectionActivity.EXTRA_ID, id);
        intent.putExtra(InspectionActivity.EXTRA_READONLY, readOnly);
        host.startActivityForResult(intent, InspectionsPage.REQ_INSPECT);
    }

    private View siteCard() {
        LinearLayout card = card();
        card.addView(U.tv(ctx, "站点切换", 14, U.INK, true));
        for (int i = 0; i < sites.length(); i++) {
            final JSONObject site = sites.optJSONObject(i);
            if (site == null) continue;
            final String id = site.optString("id", "");
            String name = site.optString("name", id);
            boolean current = id.equals(session.siteId());

            LinearLayout row = U.linear(ctx, LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            U.pad(row, ctx, 0, 11, 0, 11);
            row.addView(U.dot(ctx, current ? U.BRAND : U.LINE_STRONG, 8));
            String label = current ? name + " · 当前" : name;
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, U.WRAP, 1f);
            lp.setMargins(U.dp(ctx, 9), 0, 0, 0);
            row.addView(U.tv(ctx, label, 12.5f, current ? U.BRAND : U.INK2, current), lp);
            if (!current) row.addView(U.tv(ctx, "\u203a", 16, U.MUTED2, false));
            row.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    if (id.equals(session.siteId())) return;
                    session.setSite(id, site.optString("name", id));
                    host.onSiteChanged();
                    U.toast(ctx, "已切换至 " + site.optString("name", id));
                }
            });
            card.addView(U.divider(ctx, U.LINE));
            card.addView(row);
        }
        return card;
    }

    private View connectionCard() {
        LinearLayout card = card();
        boolean local = session.isLocal();
        card.addView(U.tv(ctx, "连接设置", 14, U.INK, true));
        card.addView(U.kv(ctx, local ? "数据来源" : "服务器",
                        local ? "内置本机数据库" : session.baseUrl()),
                U.lpWith(ctx, U.MATCH, U.WRAP, 0, 8, 0, 0));
        TextView change = U.ghostButton(ctx, local ? "连接电脑上的平台服务" : "修改服务器地址");
        change.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (session.isLocal()) {
                    connectServer();
                } else {
                    changeServer();
                }
            }
        });
        card.addView(change, U.lpWith(ctx, U.MATCH, U.dp(ctx, 44), 0, 12, 0, 0));
        return card;
    }

    private void connectServer() {
        session.setDemo(false);
        session.clearToken();
        session.setUser(null);
        Api.onUnauthorized = null;
        Intent intent = new Intent(host, LoginActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        host.startActivity(intent);
        host.finish();
    }

    private void changeServer() {
        U.inputDialog(host, "修改服务器地址", "http://电脑IP:8765", session.baseUrl(), false,
                new U.InputCb() {
                    @Override
                    public void onInput(String text) {
                        String base = Session.normalizeBase(text);
                        if (base.length() == 0) {
                            U.toast(host, "请填写服务器地址");
                            return;
                        }
                        session.setBaseUrl(base);
                        session.clearToken();
                        Api.onUnauthorized = null;
                        Intent intent = new Intent(host, LoginActivity.class);
                        intent.putExtra(LoginActivity.EXTRA_SERVER, base);
                        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
                        host.startActivity(intent);
                        host.finish();
                    }
                });
    }

    private void addLogout() {
        TextView logout = U.dangerButton(ctx, "退出登录");
        logout.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                U.confirm(host, "退出登录", "退出后需要重新输入账号与密码。", "退出", new Runnable() {
                    @Override
                    public void run() {
                        session.logout();
                        Api.onUnauthorized = null;
                        Intent intent = new Intent(host, LoginActivity.class);
                        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
                        host.startActivity(intent);
                        host.finish();
                    }
                });
            }
        });
        body.addView(logout, U.lpWith(ctx, U.MATCH, U.dp(ctx, 48), 0, 14, 0, 0));
        TextView footer = U.tv(ctx, "小禹 · 原生安卓客户端 v" + U.appVersion(ctx),
                10.5f, U.MUTED2, false);
        footer.setGravity(Gravity.CENTER);
        body.addView(footer, U.lpWith(ctx, U.MATCH, U.WRAP, 0, 12, 0, 0));
    }
}
