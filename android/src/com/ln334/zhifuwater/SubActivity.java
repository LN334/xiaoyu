package com.ln334.zhifuwater;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * 「更多」里的二级页面容器：水质化验 / 设备台账 / 智能诊断共用。
 * 只负责顶部返回栏与滚动容器，内容由 {@link SubPages} 构建。
 */
public class SubActivity extends Activity {

    public static final String EXTRA_KIND = "kind";
    public static final String EXTRA_TITLE = "title";

    public static final String KIND_QUALITY = "quality";
    public static final String KIND_DEVICES = "devices";
    public static final String KIND_DIAGNOSIS = "diagnosis";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String kind = getIntent() == null ? "" : getIntent().getStringExtra(EXTRA_KIND);
        String title = getIntent() == null ? "" : getIntent().getStringExtra(EXTRA_TITLE);
        if (title == null || title.length() == 0) title = titleOf(kind);
        setContentView(buildUi(kind, title));
    }

    private static String titleOf(String kind) {
        if (KIND_QUALITY.equals(kind)) return "水质化验";
        if (KIND_DEVICES.equals(kind)) return "设备台账";
        if (KIND_DIAGNOSIS.equals(kind)) return "智能诊断";
        return "详情";
    }

    private View buildUi(String kind, String title) {
        LinearLayout root = U.linear(this, LinearLayout.VERTICAL);
        root.setBackgroundColor(U.BG);
        root.addView(buildHeader(title), U.lp(U.MATCH, U.WRAP));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setClipToPadding(false);
        scroll.setBackgroundColor(U.BG);
        LinearLayout body = U.linear(this, LinearLayout.VERTICAL);
        U.pad(body, this, 14, 12, 14, 28);
        scroll.addView(body, new ScrollView.LayoutParams(U.MATCH, U.WRAP));
        root.addView(scroll, U.lp(U.MATCH, 0, 1f));

        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(U.MATCH, U.MATCH);
        root.setLayoutParams(params);
        new SubPages(this, body).build(kind);
        return root;
    }

    private View buildHeader(String title) {
        LinearLayout bar = U.linear(this, LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(U.WHITE);
        U.pad(bar, this, 10, 8, 14, 8);

        TextView back = U.tv(this, "‹", 26, U.INK, false);
        back.setGravity(Gravity.CENTER);
        back.setBackground(U.roundBg(this, 0x00000000, 18));
        back.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        });
        bar.addView(back, U.lp(U.dp(this, 36), U.dp(this, 36)));
        LinearLayout.LayoutParams titleLp = U.lpWith(this, 0, U.WRAP, 6, 0, 0, 0);
        titleLp.weight = 1f;
        bar.addView(U.tv(this, title, 17, U.INK, true), titleLp);

        View line = new View(this);
        line.setBackgroundColor(U.LINE);
        LinearLayout wrap = U.linear(this, LinearLayout.VERTICAL);
        wrap.addView(bar, U.lp(U.MATCH, U.WRAP));
        wrap.addView(line, U.lp(U.MATCH, Math.max(1, U.dp(this, 0.8f))));
        return wrap;
    }
}
