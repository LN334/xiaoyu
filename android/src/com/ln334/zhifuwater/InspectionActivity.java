package com.ln334.zhifuwater;

import android.app.Activity;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
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

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 巡检执行页：逐项选择结果（正常/关注/异常）+ 备注，整单提交；异常项由服务端自动建工单。
 */
public class InspectionActivity extends Activity {

    public static final String EXTRA_ID = "inspection_id";
    public static final String EXTRA_READONLY = "inspection_readonly";

    private static final String[] RESULT_LABELS = {"正常", "关注", "异常"};
    private static final String[] RESULT_VALUES = {"ok", "attention", "abnormal"};

    private String taskId;
    private boolean forceReadOnly;
    private JSONObject detail;
    private boolean submitting;

    private LinearLayout bodyLayout;
    private ScrollView scroll;
    private FrameLayout contentFrame;
    private ProgressBar loading;
    private LinearLayout bottomBar;
    private TextView submitBtn;
    private TextView statusChip;

    private String[] itemKeys;
    private int[] results;
    private EditText[] noteInputs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        taskId = getIntent() == null ? null : getIntent().getStringExtra(EXTRA_ID);
        forceReadOnly = getIntent() != null && getIntent().getBooleanExtra(EXTRA_READONLY, false);
        if (taskId == null || taskId.length() == 0) {
            U.toast(this, "缺少巡检任务编号");
            finish();
            return;
        }
        buildUi();
        load();
    }

    private void buildUi() {
        LinearLayout root = U.linear(this, LinearLayout.VERTICAL);
        root.setBackgroundColor(U.BG);

        LinearLayout toolbar = U.linear(this, LinearLayout.HORIZONTAL);
        toolbar.setBackgroundColor(U.WHITE);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(U.dp(this, 6), U.dp(this, 6), U.dp(this, 12), U.dp(this, 6));

        FrameLayout back = new FrameLayout(this);
        back.setClickable(true);
        GlyphView arrow = U.glyph(this, GlyphView.ARROW_RIGHT, 20, U.INK2);
        arrow.setRotation(180f);
        FrameLayout.LayoutParams alp = new FrameLayout.LayoutParams(U.dp(this, 20), U.dp(this, 20));
        alp.gravity = Gravity.CENTER;
        back.addView(arrow, alp);
        back.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        });
        toolbar.addView(back, U.lp(U.dp(this, 48), U.dp(this, 48)));

        LinearLayout titles = U.linear(this, LinearLayout.VERTICAL);
        titles.setPadding(U.dp(this, 2), 0, 0, 0);
        titles.addView(U.tv(this, "巡检执行", 16, U.INK, true));
        titles.addView(U.tv(this, "逐项填写结果与备注", 10, U.MUTED2, false),
                U.lpWith(this, U.MATCH, U.WRAP, 0, 2, 0, 0));
        toolbar.addView(titles, U.lp(0, U.WRAP, 1f));

        statusChip = U.chip(this, "加载中", U.MUTED, R.drawable.bg_chip_neutral);
        toolbar.addView(statusChip);
        root.addView(toolbar, U.lp(U.MATCH, U.WRAP));
        root.addView(U.divider(this, U.LINE), U.lp(U.MATCH, U.dp(this, 0.7f)));

        contentFrame = new FrameLayout(this);
        root.addView(contentFrame, U.lp(U.MATCH, 0, 1f));

        bodyLayout = U.linear(this, LinearLayout.VERTICAL);
        bodyLayout.setPadding(U.dp(this, 14), U.dp(this, 12), U.dp(this, 14), U.dp(this, 26));
        scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(U.BG);
        scroll.addView(bodyLayout, new ScrollView.LayoutParams(U.MATCH, U.WRAP));
        contentFrame.addView(scroll, new FrameLayout.LayoutParams(U.MATCH, U.MATCH));

        loading = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        loading.setIndeterminate(true);
        FrameLayout.LayoutParams llp = new FrameLayout.LayoutParams(U.dp(this, 160), U.dp(this, 4));
        llp.gravity = Gravity.CENTER;
        contentFrame.addView(loading, llp);

        bottomBar = U.linear(this, LinearLayout.VERTICAL);
        bottomBar.setBackgroundColor(U.WHITE);
        bottomBar.setVisibility(View.GONE);
        bottomBar.addView(U.divider(this, U.LINE), U.lp(U.MATCH, Math.max(1, U.dp(this, 0.7f))));
        LinearLayout pad = U.linear(this, LinearLayout.HORIZONTAL);
        pad.setPadding(U.dp(this, 14), U.dp(this, 10), U.dp(this, 14), U.dp(this, 10));
        submitBtn = U.primaryButton(this, "提交巡检结果");
        submitBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                submit();
            }
        });
        pad.addView(submitBtn, U.lp(U.MATCH, U.dp(this, 48)));
        bottomBar.addView(pad);
        root.addView(bottomBar, U.lp(U.MATCH, U.WRAP));

        setContentView(root);
    }

    private void load() {
        loading.setVisibility(View.VISIBLE);
        scroll.setVisibility(View.GONE);
        bottomBar.setVisibility(View.GONE);
        Api.get(this, "/api/inspections/" + taskId, new Api.Cb() {
            @Override
            public void done(JSONObject root, String error) {
                if (isFinishing()) return;
                loading.setVisibility(View.GONE);
                if (error != null) {
                    showError(error);
                    return;
                }
                JSONObject data = root == null ? null : root.optJSONObject("data");
                if (data == null) {
                    showError("响应中缺少巡检详情");
                    return;
                }
                detail = data;
                render();
            }
        });
    }

    private void showError(String message) {
        scroll.setVisibility(View.GONE);
        bottomBar.setVisibility(View.GONE);
        contentFrame.removeAllViews();

        LinearLayout box = U.linear(this, LinearLayout.VERTICAL);
        box.setPadding(U.dp(this, 14), U.dp(this, 12), U.dp(this, 14), 0);
        LinearLayout card = U.card(this);
        card.addView(U.tv(this, "加载失败", 14, U.DANGER, true));
        TextView t = U.tv(this, message, 12.5f, U.INK2, false);
        t.setLineSpacing(U.dp(this, 2), 1f);
        card.addView(t, U.lpWith(this, U.MATCH, U.WRAP, 0, 6, 0, 0));
        TextView retry = U.ghostButton(this, "重新加载");
        retry.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                contentFrame.removeAllViews();
                contentFrame.addView(scroll, new FrameLayout.LayoutParams(U.MATCH, U.MATCH));
                FrameLayout.LayoutParams llp = new FrameLayout.LayoutParams(U.dp(InspectionActivity.this, 160),
                        U.dp(InspectionActivity.this, 4));
                llp.gravity = Gravity.CENTER;
                contentFrame.addView(loading, llp);
                scroll.setVisibility(View.GONE);
                loading.setVisibility(View.VISIBLE);
                load();
            }
        });
        card.addView(retry, U.lpWith(this, U.dp(this, 124), U.dp(this, 44), 0, 12, 0, 0));
        box.addView(card);
        contentFrame.addView(box, new FrameLayout.LayoutParams(U.MATCH, U.WRAP));
    }

    private void render() {
        String status = detail.optString("status", "pending");
        boolean isDone = "done".equals(status);
        final boolean readOnly = forceReadOnly || isDone;

        statusChip.setText(U.inspectionStatusName(status));
        statusChip.setTextColor(U.statusFg(status));
        statusChip.setBackgroundResource(U.statusBg(status));

        scroll.setVisibility(View.VISIBLE);
        bodyLayout.removeAllViews();

        LinearLayout header = U.card(this);
        LinearLayout top = U.linear(this, LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.addView(U.chip(this, U.inspectionTypeName(detail.optString("type", "")),
                U.INFO, R.drawable.bg_chip_info));
        top.addView(U.chip(this, U.inspectionStatusName(status), U.statusFg(status), U.statusBg(status)),
                U.lpWith(this, U.WRAP, U.WRAP, 6, 0, 0, 0));
        if (detail.optBoolean("overdue") && !isDone) {
            top.addView(U.chip(this, "已超时", U.DANGER, R.drawable.bg_chip_danger),
                    U.lpWith(this, U.WRAP, U.WRAP, 6, 0, 0, 0));
        }
        header.addView(top);

        TextView title = U.tv(this, detail.optString("title", "巡检任务"), 17, U.INK, true);
        title.setLineSpacing(U.dp(this, 2), 1f);
        header.addView(title, U.lpWith(this, U.MATCH, U.WRAP, 0, 8, 0, 8));

        String planName = detail.optString("planName", "");
        if (planName.length() > 0) header.addView(U.kv(this, "巡检计划", planName));
        header.addView(U.kv(this, "所属站点", detail.optString("siteName", "--")));
        header.addView(U.kv(this, "执行人", detail.optString("assigneeName", "--")));
        header.addView(U.kv(this, "截止时间", U.timeFull(detail.optString("dueAt"))));
        header.addView(U.kv(this, "任务编号", detail.optString("id", taskId)));
        String summary = detail.optString("summary", "");
        if (summary.length() > 0) header.addView(U.kv(this, "提交摘要", summary));
        U.addCard(bodyLayout, header, this, 10);

        JSONArray items = detail.optJSONArray("items");
        int count = items == null ? 0 : items.length();
        itemKeys = new String[count];
        results = new int[count];
        noteInputs = new EditText[count];
        for (int i = 0; i < count; i++) {
            results[i] = -1;
            JSONObject item = items.optJSONObject(i);
            if (item == null) continue;
            itemKeys[i] = item.optString("key", "item-" + i);
            results[i] = resultIndex(item.optString("result", ""));
        }

        bodyLayout.addView(U.sectionHeader(this, "巡检项（共 " + count + " 项）", readOnly ? "只读" : null, null),
                U.lpWith(this, U.MATCH, U.WRAP, 2, 4, 2, 8));

        for (int i = 0; i < count; i++) {
            JSONObject item = items == null ? null : items.optJSONObject(i);
            if (item == null) continue;
            U.addCard(bodyLayout, itemCard(i, item, readOnly), this, 10);
        }

        if (!readOnly) {
            LinearLayout tip = U.cardFlat(this);
            TextView t = U.tv(this, "全部项目填写完成后提交；选择「异常」的项目会由平台自动生成工单。",
                    11, U.MUTED, false);
            t.setLineSpacing(U.dp(this, 2), 1f);
            tip.addView(t);
            U.addCard(bodyLayout, tip, this, 10);
            bottomBar.setVisibility(View.VISIBLE);
        } else {
            bottomBar.setVisibility(View.GONE);
        }
    }

    private View itemCard(final int index, JSONObject item, boolean readOnly) {
        LinearLayout card = U.card(this);
        card.setBackgroundResource(R.drawable.bg_card);

        LinearLayout head = U.linear(this, LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.TOP);
        TextView no = U.tv(this, String.valueOf(index + 1), 11, U.BRAND, true);
        no.setGravity(Gravity.CENTER);
        no.setBackground(U.roundBg(this, U.BRAND_BG, 9));
        head.addView(no, U.lp(U.dp(this, 24), U.dp(this, 24)));
        TextView label = U.tv(this, item.optString("label", "巡检项"), 13.5f, U.INK, true);
        label.setLineSpacing(U.dp(this, 1.5f), 1f);
        LinearLayout.LayoutParams labelLp = U.lpWith(this, 0, U.WRAP, 8, 0, 0, 0);
        labelLp.weight = 1f;
        head.addView(label, labelLp);
        card.addView(head);

        String standard = item.optString("standard", "");
        if (standard.length() > 0) {
            card.addView(U.tv(this, "标准：" + standard, 11, U.MUTED, false),
                    U.lpWith(this, U.MATCH, U.WRAP, 0, 6, 0, 0));
        }

        if (readOnly) {
            int idx = resultIndex(item.optString("result", ""));
            String value = idx >= 0 ? RESULT_VALUES[idx] : "";
            card.addView(U.chip(this, idx >= 0 ? RESULT_LABELS[idx] : "未填写",
                    resultFg(value), resultBg(value)), U.lpWith(this, U.WRAP, U.WRAP, 0, 9, 0, 0));
            String note = item.optString("note", "");
            if (note.length() > 0) {
                TextView n = U.tv(this, "备注：" + note, 11.5f, U.INK2, false);
                n.setLineSpacing(U.dp(this, 1.5f), 1f);
                card.addView(n, U.lpWith(this, U.MATCH, U.WRAP, 0, 7, 0, 0));
            }
        } else {
            card.addView(resultSelector(index), U.lpWith(this, U.MATCH, U.WRAP, 0, 9, 0, 0));
            EditText note = U.input(this, "备注（可选，例如现场情况说明）",
                    item.optString("note", ""), InputType.TYPE_CLASS_TEXT, true);
            noteInputs[index] = note;
            card.addView(note, U.lpWith(this, U.MATCH, U.WRAP, 0, 9, 0, 0));
        }
        return card;
    }

    private View resultSelector(final int index) {
        final LinearLayout row = U.linear(this, LinearLayout.HORIZONTAL);
        for (int i = 0; i < RESULT_LABELS.length; i++) {
            final int option = i;
            final TextView optionView = U.tv(this, RESULT_LABELS[i], 12.5f,
                    results[index] == i ? U.WHITE : U.INK2, results[index] == i);
            optionView.setGravity(Gravity.CENTER);
            optionView.setBackgroundResource(R.drawable.bg_seg);
            optionView.setSelected(results[index] == i);
            optionView.setClickable(true);
            optionView.setMinHeight(U.dp(this, 44));
            optionView.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    results[index] = option;
                    for (int k = 0; k < row.getChildCount(); k++) {
                        TextView child = (TextView) row.getChildAt(k);
                        boolean selected = k == option;
                        child.setSelected(selected);
                        child.setTextColor(selected ? U.WHITE : U.INK2);
                        child.setTypeface(selected ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
                    }
                }
            });
            LinearLayout.LayoutParams p = U.lp(0, U.dp(this, 44), 1f);
            if (i > 0) p.setMargins(U.dp(this, 6), 0, 0, 0);
            row.addView(optionView, p);
        }
        return row;
    }

    private int resultIndex(String value) {
        if (value == null) return -1;
        for (int i = 0; i < RESULT_VALUES.length; i++) {
            if (RESULT_VALUES[i].equals(value)) return i;
        }
        if ("normal".equals(value)) return 0;
        return -1;
    }

    private int resultFg(String value) {
        if ("abnormal".equals(value)) return U.DANGER;
        if ("attention".equals(value)) return U.WARN;
        if ("ok".equals(value)) return U.OK;
        return U.MUTED;
    }

    private int resultBg(String value) {
        if ("abnormal".equals(value)) return R.drawable.bg_chip_danger;
        if ("attention".equals(value)) return R.drawable.bg_chip_warn;
        if ("ok".equals(value)) return R.drawable.bg_chip_ok;
        return R.drawable.bg_chip_neutral;
    }

    private void submit() {
        if (submitting || results == null) return;
        int missing = 0;
        for (int r : results) {
            if (r < 0) missing++;
        }
        if (missing > 0) {
            U.alert(this, "还有 " + missing + " 项未选择结果", "请为每个巡检项选择「正常 / 关注 / 异常」后再提交。", null);
            return;
        }
        JSONArray array = new JSONArray();
        try {
            for (int i = 0; i < results.length; i++) {
                JSONObject item = new JSONObject();
                item.put("key", itemKeys == null ? "item-" + i : itemKeys[i]);
                item.put("result", RESULT_VALUES[results[i]]);
                String note = noteInputs != null && noteInputs[i] != null
                        ? noteInputs[i].getText().toString().trim() : "";
                item.put("note", note);
                array.put(item);
            }
        } catch (Exception e) {
            U.alert(this, "提交失败", "巡检数据组装失败：" + e.getMessage(), null);
            return;
        }
        JSONObject body = new JSONObject();
        try {
            body.put("items", array);
            body.put("summary", "手机端提交");
        } catch (Exception ignored) {
            // ignore
        }

        setSubmitting(true);
        Api.post(this, "/api/inspections/" + taskId + "/submit", body, new Api.Cb() {
            @Override
            public void done(JSONObject root, String error) {
                if (isFinishing()) return;
                setSubmitting(false);
                if (error != null) {
                    U.alert(InspectionActivity.this, "提交失败", error, null);
                    return;
                }
                JSONObject data = root == null ? null : root.optJSONObject("data");
                JSONArray abnormal = data == null ? null : data.optJSONArray("abnormal");
                JSONObject workorder = data == null ? null : data.optJSONObject("workorder");
                StringBuilder msg = new StringBuilder("巡检结果已提交。");
                if (abnormal != null && abnormal.length() > 0) {
                    msg.append("\n\n异常项 ").append(abnormal.length()).append(" 个：");
                    for (int i = 0; i < abnormal.length(); i++) {
                        if (i > 0) msg.append("、");
                        msg.append(abnormal.optString(i));
                    }
                    if (workorder != null) {
                        msg.append("\n\n已自动生成工单 ").append(workorder.optString("id"));
                        String wt = workorder.optString("title", "");
                        if (wt.length() > 0) msg.append("（").append(wt).append("）");
                    }
                }
                U.alert(InspectionActivity.this, "提交成功", msg.toString(), new Runnable() {
                    @Override
                    public void run() {
                        setResult(RESULT_OK);
                        finish();
                    }
                });
            }
        });
    }

    private void setSubmitting(boolean value) {
        submitting = value;
        if (submitBtn != null) {
            submitBtn.setEnabled(!value);
            submitBtn.setText(value ? "提交中…" : "提交巡检结果");
        }
    }

    private void setSubmittingLoading(boolean visible) {
        if (loading == null) return;
        loading.setVisibility(visible ? View.VISIBLE : View.GONE);
    }
}
