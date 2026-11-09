package com.ln334.zhifuwater;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONObject;

/**
 * 登录页：默认直接进入本机演示（SQLite + 5 秒模拟引擎），
 * 连接电脑上的平台服务降级为可展开的次要入口。
 */
public class LoginActivity extends Activity {

    public static final String EXTRA_SERVER = "extra_server";

    private EditText serverInput;
    private EditText userInput;
    private EditText passInput;
    private TextView errorView;
    private TextView loginButton;
    private ProgressBar progress;
    private LinearLayout serverBox;
    private TextView serverToggle;
    private boolean loading;
    private boolean serverOpen;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Api.onUnauthorized = null;

        Session session = Session.of(this);
        String forcedServer = getIntent() == null ? null : getIntent().getStringExtra(EXTRA_SERVER);
        if (session.isLoggedIn() && forcedServer == null) {
            goMain();
            return;
        }
        buildUi(session, forcedServer);
    }

    private void buildUi(Session session, String forcedServer) {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(U.BG);

        LinearLayout page = U.linear(this, LinearLayout.VERTICAL);
        page.setPadding(U.dp(this, 22), U.dp(this, 40), U.dp(this, 22), U.dp(this, 28));

        // 品牌区
        FrameLayout logoBox = new FrameLayout(this);
        logoBox.setBackground(U.roundBg(this, U.BRAND_BG, 18));
        GlyphView drop = U.glyph(this, GlyphView.DROP, 34, U.BRAND);
        FrameLayout.LayoutParams dropLp = new FrameLayout.LayoutParams(U.dp(this, 34), U.dp(this, 34));
        dropLp.gravity = Gravity.CENTER;
        logoBox.addView(drop, dropLp);
        page.addView(logoBox, U.lp(U.dp(this, 64), U.dp(this, 64)));

        TextView appName = U.tv(this, "小禹", 26, U.INK, true);
        page.addView(appName, U.lpWith(this, U.MATCH, U.WRAP, 0, 18, 0, 0));
        TextView sub = U.tv(this, "智慧水处理平台 · 移动端", 13, U.MUTED, false);
        page.addView(sub, U.lpWith(this, U.MATCH, U.WRAP, 0, 5, 0, 0));
        TextView welcome = U.tv(this, "本机演示：数据每 5 秒自动推进，可操作告警 / 工单 / 巡检",
                12, U.MUTED2, false);
        page.addView(welcome, U.lpWith(this, U.MATCH, U.WRAP, 0, 14, 0, 0));

        // 主卡片：直接进入
        LinearLayout card = U.card(this);
        U.pad(card, this, 18, 16, 18, 18);
        page.addView(card, U.lpWith(this, U.MATCH, U.WRAP, 0, 22, 0, 0));

        TextView enterButton = U.primaryButton(this, "直接进入（本机演示）");
        enterButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                enterLocal();
            }
        });
        card.addView(enterButton, U.lpWith(this, U.MATCH, U.dp(this, 50), 0, 0, 0, 0));

        TextView localHint = U.tv(this,
                "本机模式不连电脑：站点、点位、告警、工单、巡检都在手机 SQLite 里，"
                        + "杀进程重开数据仍在，模拟引擎恢复推进后时间连续。",
                10.5f, U.MUTED2, false);
        localHint.setLineSpacing(U.dp(this, 2), 1f);
        card.addView(localHint, U.lpWith(this, U.MATCH, U.WRAP, 0, 12, 0, 0));

        // 次要入口：连接服务器（默认折叠）
        LinearLayout serverCard = U.card(this);
        U.pad(serverCard, this, 18, 4, 18, 12);
        page.addView(serverCard, U.lpWith(this, U.MATCH, U.WRAP, 0, 12, 0, 0));

        serverToggle = U.tv(this, "连接电脑上的平台服务  ›", 12.5f, U.MUTED, true);
        serverToggle.setPadding(0, U.dp(this, 12), 0, U.dp(this, 12));
        serverToggle.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                setServerOpen(!serverOpen);
            }
        });
        serverCard.addView(serverToggle, U.lp(U.MATCH, U.WRAP));

        serverBox = U.linear(this, LinearLayout.VERTICAL);
        serverBox.setVisibility(View.GONE);
        serverCard.addView(serverBox, U.lp(U.MATCH, U.WRAP));

        serverInput = U.input(this, "http://电脑IP:8765", serverUrlText(session, forcedServer),
                InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI, false);
        addField(serverBox, "服务器地址", serverInput, 4);

        userInput = U.input(this, "请输入账号", session.username(),
                InputType.TYPE_CLASS_TEXT, false);
        addField(serverBox, "账号", userInput, 14);

        passInput = U.input(this, "请输入密码", "",
                InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD, false);
        addField(serverBox, "密码", passInput, 14);

        errorView = U.tv(this, "", 12.5f, U.DANGER, false);
        errorView.setVisibility(View.GONE);
        errorView.setLineSpacing(U.dp(this, 2), 1f);
        serverBox.addView(errorView, U.lpWith(this, U.MATCH, U.WRAP, 0, 10, 0, 0));

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setIndeterminate(true);
        progress.setVisibility(View.GONE);
        serverBox.addView(progress, U.lpWith(this, U.MATCH, U.dp(this, 3), 0, 12, 0, 4));

        loginButton = U.primaryButton(this, "登 录");
        loginButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                doLogin();
            }
        });
        serverBox.addView(loginButton, U.lpWith(this, U.MATCH, U.dp(this, 46), 0, 14, 0, 0));

        TextView serverHint = U.tv(this, "平台演示账号 admin / water123，需手机与电脑同一网络。",
                10.5f, U.MUTED2, false);
        serverHint.setLineSpacing(U.dp(this, 2), 1f);
        serverBox.addView(serverHint, U.lpWith(this, U.MATCH, U.WRAP, 0, 10, 0, 0));

        TextView footer = U.tv(this, "小禹 · 原生安卓客户端 v" + U.appVersion(this), 11.5f, U.MUTED2, false);
        footer.setGravity(Gravity.CENTER);
        page.addView(footer, U.lpWith(this, U.MATCH, U.WRAP, 0, 18, 0, 0));

        TextView modeHint = U.tv(this, "当前数据模式：" + modeText(session), 10.5f, U.MUTED2, false);
        modeHint.setGravity(Gravity.CENTER);
        page.addView(modeHint, U.lpWith(this, U.MATCH, U.WRAP, 0, 6, 0, 0));

        scroll.addView(page, new ScrollView.LayoutParams(U.MATCH, U.WRAP));
        setContentView(scroll);

        if (forcedServer != null) setServerOpen(true);
    }

    private String modeText(Session session) {
        if (!session.isLoggedIn()) return "尚未选择";
        return session.isLocal() ? "本机演示（SQLite）" : "服务器 · " + session.baseUrl();
    }

    private void setServerOpen(boolean open) {
        serverOpen = open;
        if (serverBox != null) serverBox.setVisibility(open ? View.VISIBLE : View.GONE);
        if (serverToggle != null) {
            serverToggle.setText(open ? "连接电脑上的平台服务  ⌄" : "连接电脑上的平台服务  ›");
        }
    }

    private String serverUrlText(Session session, String forcedServer) {
        if (forcedServer != null) return forcedServer;
        String base = session.baseUrl();
        return base == null || base.length() == 0 ? "" : base;
    }

    private void addField(LinearLayout parent, String label, EditText input, int topMargin) {
        TextView l = U.tv(this, label, 12, U.MUTED, true);
        parent.addView(l, U.lpWith(this, U.MATCH, U.WRAP, 0, topMargin, 0, 6));
        parent.addView(input, U.lp(U.MATCH, U.WRAP));
    }

    private void showError(String msg) {
        if (errorView == null) return;
        if (msg == null || msg.length() == 0) {
            errorView.setVisibility(View.GONE);
            return;
        }
        errorView.setText(msg);
        errorView.setVisibility(View.VISIBLE);
        setServerOpen(true);
    }

    private void setLoading(boolean value) {
        loading = value;
        if (progress != null) progress.setVisibility(value ? View.VISIBLE : View.GONE);
        if (loginButton != null) {
            loginButton.setEnabled(!value);
            loginButton.setText(value ? "登录中…" : "登 录");
        }
    }

    /** 本机模式入口：建库 + 导入快照 + 启引擎，不联网。 */
    private void enterLocal() {
        if (loading) return;
        Session s = Session.of(this);
        JSONObject user = null;
        try {
            // 首次进入时把 assets/demo 快照灌进 SQLite（已灌过则直接返回）
            LocalDb.get(this).db();
            LocalEngine.get(this).start();
            JSONObject meRoot = LocalApi.respond(this, "GET", "/api/auth/me", null);
            JSONObject me = meRoot == null ? null : meRoot.optJSONObject("data");
            user = me == null ? null : me.optJSONObject("user");
        } catch (Throwable t) {
            showError("本机数据初始化失败：" + t.getMessage());
            return;
        }
        s.setMode(Session.MODE_LOCAL);
        s.setToken("local");
        s.setUsername("admin");
        s.setBaseUrl("");
        s.setUser(user);
        s.setSite(Session.DEFAULT_SITE_ID, Session.DEFAULT_SITE_NAME);
        U.toast(this, "已进入本机演示");
        goMain();
    }

    private void doLogin() {
        if (loading) return;
        final String base = Session.normalizeBase(serverInput.getText().toString());
        final String user = userInput.getText().toString().trim();
        final String pass = passInput.getText().toString();
        if (base.length() == 0) {
            showError("请填写服务器地址，例如 http://192.168.1.10:8765");
            serverInput.requestFocus();
            return;
        }
        if (user.length() == 0) {
            showError("请填写账号");
            userInput.requestFocus();
            return;
        }
        if (pass.length() == 0) {
            showError("请填写密码");
            passInput.requestFocus();
            return;
        }
        showError(null);
        U.hideKeyboard(this);
        setLoading(true);
        final String oldBase = Session.of(this).baseUrl();
        Api.login(this, base, user, pass, new Api.Cb() {
            @Override
            public void done(JSONObject root, String error) {
                setLoading(false);
                if (error != null) {
                    showError(error);
                    return;
                }
                JSONObject data = root == null ? null : root.optJSONObject("data");
                String token = data == null ? "" : data.optString("token", "");
                if (token.length() == 0) {
                    showError("登录响应缺少令牌，请确认服务器地址是否正确");
                    return;
                }
                JSONObject u = data.optJSONObject("user");
                Session s = Session.of(LoginActivity.this);
                s.setMode(Session.MODE_SERVER);
                s.setBaseUrl(base);
                s.setToken(token);
                s.setUsername(user);
                s.setUser(u);
                if (!base.equals(oldBase)) {
                    s.setSite(Session.DEFAULT_SITE_ID, Session.DEFAULT_SITE_NAME);
                }
                String name = u == null ? user : u.optString("name", user);
                U.toast(LoginActivity.this, "登录成功，欢迎 " + name);
                goMain();
            }
        });
    }

    private void goMain() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(intent);
        finish();
    }
}
