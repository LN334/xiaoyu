package com.ln334.zhifuwater;

import android.content.Context;
import android.content.SharedPreferences;
import android.text.TextUtils;

import org.json.JSONObject;

/**
 * 本地会话：服务器地址、令牌、当前用户与当前站点，保存在 SharedPreferences。
 */
public final class Session {

    private static final String PREF = "zhifu_water";
    private static final String K_BASE = "base_url";
    private static final String K_TOKEN = "token";
    private static final String K_USER = "user_json";
    private static final String K_USERNAME = "username";
    private static final String K_SITE_ID = "site_id";
    private static final String K_SITE_NAME = "site_name";
    private static final String K_DEMO = "demo_mode";
    private static final String K_MODE = "mode";

    /** 本机模式：数据来自 SQLite，由 LocalEngine 每 5 秒推进。 */
    public static final String MODE_LOCAL = "local";
    /** 服务器模式：数据来自电脑上的平台服务。 */
    public static final String MODE_SERVER = "server";

    public static final String DEFAULT_SITE_ID = "site-1";
    public static final String DEFAULT_SITE_NAME = "中试装置 · 100 L/h";

    private final SharedPreferences sp;

    private Session(Context c) {
        sp = c.getApplicationContext().getSharedPreferences(PREF, Context.MODE_PRIVATE);
    }

    public static Session of(Context c) {
        return new Session(c);
    }

    public String baseUrl() {
        return sp.getString(K_BASE, "");
    }

    public void setBaseUrl(String baseUrl) {
        sp.edit().putString(K_BASE, baseUrl == null ? "" : baseUrl).apply();
    }

    public String token() {
        return sp.getString(K_TOKEN, "");
    }

    public void setToken(String token) {
        sp.edit().putString(K_TOKEN, token == null ? "" : token).apply();
    }

    public boolean isLoggedIn() {
        return !TextUtils.isEmpty(token());
    }

    /**
     * 当前数据模式：local（本机 SQLite + 模拟引擎）/ server（电脑上的平台服务）。
     * 兼容旧版本只记录了 demo_mode 的安装。
     */
    public String mode() {
        String m = sp.getString(K_MODE, null);
        if (MODE_LOCAL.equals(m) || MODE_SERVER.equals(m)) return m;
        return sp.getBoolean(K_DEMO, false) ? MODE_LOCAL : MODE_SERVER;
    }

    public void setMode(String mode) {
        String m = MODE_LOCAL.equals(mode) ? MODE_LOCAL : MODE_SERVER;
        sp.edit().putString(K_MODE, m).putBoolean(K_DEMO, MODE_LOCAL.equals(m)).apply();
    }

    public boolean isLocal() {
        return MODE_LOCAL.equals(mode());
    }

    public boolean isServer() {
        return MODE_SERVER.equals(mode());
    }

    /** 兼容旧代码：演示 = 本机模式。 */
    public boolean isDemo() {
        return isLocal();
    }

    /** 兼容旧代码：设置演示开关即切换数据模式。 */
    public void setDemo(boolean demo) {
        setMode(demo ? MODE_LOCAL : MODE_SERVER);
    }

    public void clearToken() {
        sp.edit().remove(K_TOKEN).apply();
    }

    public String username() {
        return sp.getString(K_USERNAME, "");
    }

    public void setUsername(String username) {
        sp.edit().putString(K_USERNAME, username == null ? "" : username).apply();
    }

    public JSONObject user() {
        String raw = sp.getString(K_USER, "");
        if (TextUtils.isEmpty(raw)) return null;
        try {
            return new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    public void setUser(JSONObject user) {
        if (user == null) {
            sp.edit().remove(K_USER).apply();
        } else {
            sp.edit().putString(K_USER, user.toString()).apply();
        }
    }

    public String siteId() {
        return sp.getString(K_SITE_ID, DEFAULT_SITE_ID);
    }

    public String siteName() {
        return sp.getString(K_SITE_NAME, DEFAULT_SITE_NAME);
    }

    public void setSite(String id, String name) {
        if (TextUtils.isEmpty(id)) return;
        sp.edit().putString(K_SITE_ID, id)
                .putString(K_SITE_NAME, TextUtils.isEmpty(name) ? id : name)
                .apply();
    }

    public void logout() {
        sp.edit().remove(K_TOKEN).remove(K_USER).remove(K_DEMO).remove(K_MODE).apply();
    }

    /**
     * 规范化服务器地址：补协议、去掉末尾斜杠与多余的 /api 后缀。
     */
    public static String normalizeBase(String raw) {
        if (raw == null) return "";
        String s = raw.trim();
        if (s.length() == 0) return "";
        String lower = s.toLowerCase();
        if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
            s = "http://" + s;
        }
        while (s.endsWith("/")) {
            s = s.substring(0, s.length() - 1);
        }
        if (s.toLowerCase().endsWith("/api")) {
            s = s.substring(0, s.length() - 4);
        }
        while (s.endsWith("/")) {
            s = s.substring(0, s.length() - 1);
        }
        // 只填了 IP / 主机名时，补平台默认端口 8765，避免误发到 80 端口
        int schemeEnd = s.indexOf("://");
        if (schemeEnd > 0) {
            String head = s.substring(0, schemeEnd + 3);
            String rest = s.substring(schemeEnd + 3);
            int slash = rest.indexOf('/');
            String host = slash >= 0 ? rest.substring(0, slash) : rest;
            String tail = slash >= 0 ? rest.substring(slash) : "";
            if (host.length() > 0 && host.indexOf(':') < 0 && host.indexOf('[') < 0) {
                s = head + host + ":8765" + tail;
            }
        }
        return s;
    }
}
