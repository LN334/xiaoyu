package com.ln334.zhifuwater;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 在电脑 JVM 上验证 JSON null 的清洗规则（不需要设备）。
 *
 * <p>Android 自带的 org.json 里，{@code optString(name, fallback)} 遇到 JSON null 会返回
 * 字符串 "null"（{@code String.valueOf(JSONObject.NULL)}），不走 fallback —— 这就是总览
 * 卡片画成 "null" 的根因（真机截图与 <code>OverviewPage.java</code> 两处取值可证）。
 * 本机 <code>test/json.jar</code> 是较新的官方 org.json，已经没有这个行为，所以这里只断言
 * 机制（JSONObject.NULL 的字符串形态）与清洗结果，不复现旧实现。</p>
 *
 * <p>用法（在 android/ 下）：<br>
 *   javac -encoding UTF-8 -cp test/json.jar -d test/out
 *         test/JsonHarness.java src/com/ln334/zhifuwater/Json.java<br>
 *   java -cp "test/out;test/json.jar" com.ln334.zhifuwater.JsonHarness</p>
 */
public final class JsonHarness {

    private static int pass = 0;
    private static int fail = 0;

    public static void main(String[] args) throws Exception {
        String raw = "{"
                + "\"display\":null,"
                + "\"value\":1.88,"
                + "\"rows\":[{\"reviewerName\":null,\"status\":\"done\"}],"
                + "\"nested\":{\"items\":[null,\"ok\"]}"
                + "}";
        JSONObject o = new JSONObject(raw);

        // 1) 坑的机制：JSON null 转成字符串就是 "null"，所以旧 org.json 的 optString 会读出它
        expect("JSONObject.NULL 的字符串形态是 \"null\"", "null".equals(String.valueOf(JSONObject.NULL)));
        expect("样本里的 display 是 JSON null", o.isNull("display"));
        System.out.println("  info 本机 json.jar 的 optString 对 null 回落到 \"" + o.optString("display", "--")
                + "\"；Android 平台读到的是 \"null\"（真机截图已证）");

        // 2) 清洗后：null -> 空串
        Json.denull(o);
        expect("denull 后 display 为空串", "".equals(o.optString("display", "X")));
        expect("denull 不改数字", Math.abs(o.optDouble("value", 0) - 1.88) < 1e-9);
        JSONArray rows = o.optJSONArray("rows");
        expect("denull 进数组对象", "".equals(rows.optJSONObject(0).optString("reviewerName", "X")));
        expect("denull 保留数组普通值", "done".equals(rows.optJSONObject(0).optString("status", "")));
        JSONArray items = o.optJSONObject("nested").optJSONArray("items");
        expect("denull 处理数组内 null 元素", "".equals(items.optString(0, "X")));
        expect("denull 保留数组内字符串", "ok".equals(items.optString(1, "")));

        // 3) 读取助手：缺失 / null / 字面量 "null" 一律回落
        JSONObject m = new JSONObject("{\"a\":null,\"b\":\"null\",\"c\":\"真值\"}");
        expect("str 对 null 回落", "--".equals(Json.str(m, "a", "--")));
        expect("str 对字面量 \"null\" 回落", "--".equals(Json.str(m, "b", "--")));
        expect("str 读取正常值", "真值".equals(Json.str(m, "c", "--")));
        expect("str 对缺失键回落", "--".equals(Json.str(m, "zzz", "--")));
        expect("str 对空对象回落", "--".equals(Json.str(null, "a", "--")));

        System.out.println("JSON-HARNESS pass=" + pass + " fail=" + fail);
        if (fail > 0) System.exit(1);
    }

    private static void expect(String name, boolean ok) {
        if (ok) {
            pass++;
            System.out.println("  ok   " + name);
        } else {
            fail++;
            System.out.println("  FAIL " + name);
        }
    }
}
