package com.ln334.zhifuwater;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Iterator;

/**
 * JSON 读取的两点补丁。
 *
 * <p>Android 自带的 org.json 对 JS null 不友好：{@code optString} 遇到 null 返回的是
 * 字符串 "null"，而不是默认值。演示快照里可选字段（display、reviewerName、resolvedAt 等）
 * 大量为 null，页面就会把这些字面量 "null" 直接画出来，内部用 isBlank 判断真名的地方也会误判。
 * 因此数据进本地库、出本地接口时各洗一遍，读取时再用 {@link #str} 兜底。</p>
 */
final class Json {

    private Json() {
    }

    /** 递归把 JSON null 换成空串（原地修改，返回同一对象）。 */
    static Object denull(Object value) {
        if (value instanceof JSONObject) {
            JSONObject obj = (JSONObject) value;
            ArrayList<String> keys = new ArrayList<String>();
            Iterator<String> it = obj.keys();
            while (it.hasNext()) keys.add(it.next());
            for (int i = 0; i < keys.size(); i++) {
                String key = keys.get(i);
                Object child = obj.opt(key);
                if (child == JSONObject.NULL) {
                    try {
                        obj.put(key, "");
                    } catch (JSONException ignored) {
                    }
                } else {
                    denull(child);
                }
            }
        } else if (value instanceof JSONArray) {
            JSONArray arr = (JSONArray) value;
            for (int i = 0; i < arr.length(); i++) {
                Object child = arr.opt(i);
                if (child == JSONObject.NULL) {
                    try {
                        arr.put(i, "");
                    } catch (JSONException ignored) {
                    }
                } else {
                    denull(child);
                }
            }
        }
        return value;
    }

    /** 读字符串：缺失、null、"null" 都回落到 fallback。 */
    static String str(JSONObject obj, String key, String fallback) {
        if (obj == null || key == null || obj.isNull(key)) return fallback;
        String text = obj.optString(key, fallback);
        if (text == null || "null".equals(text)) return fallback;
        return text;
    }
}
