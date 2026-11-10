const fs = require('fs');
const p = 'D:/小禹/android/src/com/ln334/zhifuwater/ProfilePage.java';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('检查更新')) { console.log('already patched'); process.exit(0); }
if (!s.includes('import android.net.Uri;')) {
  s = s.replace('import android.content.Intent;', 'import android.content.Intent;\nimport android.net.Uri;');
}
const anchor = '        account.addView(U.kv(ctx, "应用版本", U.appVersion(ctx)));\n        addCard(account);';
if (!s.includes(anchor)) { console.log('anchor missing'); process.exit(1); }
const insert = `        account.addView(U.kv(ctx, "应用版本", U.appVersion(ctx)));
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
                            Uri.parse("https://github.com/LN334/qingqu/releases/latest")));
                } catch (Exception ignored) {
                    U.toast(ctx, "打不开发布页，请手动访问 github.com/LN334/qingqu/releases");
                }
            }
        });
        account.addView(updateRow);
        addCard(account);`;
s = s.split(anchor).join(insert);
fs.writeFileSync(p, s, 'utf8');
console.log('profile update entry added');
