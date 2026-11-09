package com.ln334.zhifuwater;

import android.content.Intent;
import android.net.Uri;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 我的：当前用户、站点切换、修改服务器地址、退出登录。
 */
public class ProfilePage extends BasePage {

    private JSONObject meUser;
    private JSONArray sites;

    ProfilePage(MainActivity host) {
        super(host);
    }

    @Override
    protected String pageTitle() {
        return "我的";
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
                setBusy(false);
                if (error != null) {
                    showError(error);
                    return;
                }
                JSONObject data = root == null ? null : root.optJSONObject("data");
                if (data != null) {
                    JSONObject user = data.optJSONObject("user");
                    if (user != null) {
                        meUser = user;
                        session.setUser(user);
                    }
                }
                if (meUser == null) meUser = session.user();
                render();
            }
        });
    }

    private void render() {
        clearBody();
        addHead();

        JSONObject u = meUser;
        String name = u == null ? session.username() : u.optString("name", session.username());
        String roleName = u == null ? "" : u.optString("roleName", u.optString("role", ""));
        String title = u == null ? "" : u.optString("title", "");
        String phone = u == null ? "" : u.optString("phone", "");
        if (name.length() == 0) name = "当前用户";

        // 个人信息
        LinearLayout profile = U.card(ctx);
        LinearLayout row = U.linear(ctx, LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        FrameLayout avatar = new FrameLayout(ctx);
        avatar.setBackground(U.roundBg(ctx, U.BRAND, 27));
        TextView initial = U.tv(ctx, name.substring(0, 1), 21, U.WHITE, true);
        initial.setGravity(Gravity.CENTER);
        avatar.addView(initial, new FrameLayout.LayoutParams(U.MATCH, U.MATCH));
        row.addView(avatar, U.lp(U.dp(ctx, 54), U.dp(ctx, 54)));

        LinearLayout info = U.linear(ctx, LinearLayout.VERTICAL);
        info.setPadding(U.dp(ctx, 12), 0, 0, 0);
        info.addView(U.tv(ctx, name, 17, U.INK, true));
        StringBuilder sub = new StringBuilder();
        if (roleName.length() > 0) sub.append(roleName);
        if (title.length() > 0 && !title.equals(roleName)) {
            if (sub.length() > 0) sub.append(" · ");
            sub.append(title);
        }
        if (sub.length() == 0) sub.append("平台用户");
        info.addView(U.tv(ctx, sub.toString(), 11.5f, U.MUTED, false),
                U.lpWith(ctx, U.MATCH, U.WRAP, 0, 3, 0, 0));
        if (phone.length() > 0) {
            info.addView(U.tv(ctx, phone, 11, U.MUTED2, false), U.lpWith(ctx, U.MATCH, U.WRAP, 0, 3, 0, 0));
        }
        row.addView(info, U.lp(0, U.WRAP, 1f));
        profile.addView(row);

        addCard(profile);

        // 站点切换
        addSection("站点切换", sites != null ? "共 " + sites.length() + " 个" : null, null);
        if (sites == null || sites.length() == 0) {
            showEmpty("站点列表加载失败，可在右上角刷新重试。");
        } else {
            for (int i = 0; i < sites.length(); i++) {
                JSONObject site = sites.optJSONObject(i);
                if (site != null) addCard(siteRow(site));
            }
        }

        // 账号与平台
        addSection("账号", null, null);
        LinearLayout account = U.card(ctx);
        account.addView(U.kv(ctx, "登录账号", session.username().length() == 0 ? "--" : session.username()));
        account.addView(U.kv(ctx, "应用版本", U.appVersion(ctx)));
        LinearLayout updateRow = U.linear(ctx, LinearLayout.HORIZONTAL);
        updateRow.setGravity(Gravity.CENTER_VERTICAL);
        updateRow.setPadding(0, U.dp(ctx, 10), 0, U.dp(ctx, 2));
        TextView updateLabel = U.tv(ctx, "检查更新", 13, U.BRAND, true);
        updateRow.addView(updateLabel, U.lp(0, U.WRAP, 1f));
        updateRow.addView(U.tv(ctx, "v" + U.appVersion(ctx), 11.5f, U.MUTED2, false));
        updateRow.setClickable(true);
        updateRow.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                try {
                    ctx.startActivity(new Intent(Intent.ACTION_VIEW,
                            Uri.parse("https://github.com/LN334/xiaoyu/releases/latest")));
                } catch (Exception ignored) {
                    U.toast(ctx, "打不开发布页，请手动访问 github.com/LN334/xiaoyu/releases");
                }
            }
        });
        account.addView(updateRow);
        addCard(account);

        // 连接设置
        addSection("连接设置", null, null);
        boolean local = session.isLocal();
        LinearLayout server = U.card(ctx);
        server.addView(U.tv(ctx, local ? "数据来源" : "服务器地址", 11.5f, U.MUTED, true));
        TextView urlView = U.tv(ctx, local ? "本机演示 · 本地数据库"
                        : (session.baseUrl().length() == 0 ? "未设置" : session.baseUrl()),
                13, U.INK, true);
        urlView.setPadding(0, U.dp(ctx, 4), 0, 0);
        server.addView(urlView);
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
        server.addView(change, U.lpWith(ctx, U.MATCH, U.dp(ctx, 44), 0, 12, 0, 0));
        addCard(server);

        // 退出登录
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
        body.addView(logout, U.lpWith(ctx, U.MATCH, U.dp(ctx, 48), 0, 8, 0, 0));

        TextView footer = U.tv(ctx, "小禹 · 原生安卓客户端 v" + U.appVersion(ctx), 10.5f, U.MUTED2, false);
        footer.setGravity(Gravity.CENTER);
        body.addView(footer, U.lpWith(ctx, U.MATCH, U.WRAP, 0, 14, 0, 0));
    }

    private View siteRow(final JSONObject site) {
        final String id = site.optString("id", "");
        String name = site.optString("name", id);
        boolean current = id.equals(session.siteId());

        LinearLayout card = U.linear(ctx, LinearLayout.VERTICAL);
        card.setBackgroundResource(current ? R.drawable.bg_site : R.drawable.bg_card);
        U.pad(card, ctx, 13, 11, 13, 11);
        card.setClickable(true);

        LinearLayout top = U.linear(ctx, LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.addView(U.dot(ctx, current ? U.BRAND : U.LINE_STRONG, 8));
        TextView nameView = U.tv(ctx, name, 13.5f, U.INK, true);
        nameView.setSingleLine(true);
        top.addView(nameView, U.lpWith(ctx, 0, U.WRAP, 7, 0, 0, 0));
        top.addView(new View(ctx), U.lp(0, 1, 1f));
        if (current) top.addView(U.chip(ctx, "当前站点", U.BRAND, R.drawable.bg_chip_brand));
        card.addView(top);

        JSONObject counts = site.optJSONObject("counts");
        StringBuilder sub = new StringBuilder();
        if (counts != null) {
            sub.append("活动告警 ").append(counts.optInt("activeAlarms"));
            sub.append(" · 待办工单 ").append(counts.optInt("openWorkorders"));
        }
        if (sub.length() > 0) {
            card.addView(U.tv(ctx, sub.toString(), 10.5f, U.MUTED, false),
                    U.lpWith(ctx, U.MATCH, U.WRAP, 0, 4, 0, 0));
        }
        card.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (id.equals(session.siteId())) return;
                session.setSite(id, site.optString("name", id));
                host.onSiteChanged();
                U.toast(ctx, "已切换至 " + site.optString("name", id));
            }
        });
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
}
