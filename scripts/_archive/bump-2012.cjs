const fs = require('fs');
const base = 'D:/小禹/';
const simple = [
  'package.json',
  'native/ZhifuWater.Desktop/ZhifuWater.Desktop.csproj',
  'native/ZhifuWater.Kiosk/ZhifuWater.Kiosk.csproj',
  'native/installer/setup.nsi',
  'native/installer/kiosk.nsi',
  'native/ZhifuWater.Desktop/Windows/LoginWindow.xaml',
  'native/ZhifuWater.Desktop/Windows/MainWindow.xaml',
];
function rewrite(rel, fn) {
  const p = base + rel;
  const raw = fs.readFileSync(p);
  const bom = raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF;
  let s = raw.toString('utf8'); if (bom) s = s.slice(1);
  const crlf = s.includes('\r\n');
  s = s.replace(/\r\n/g, '\n');
  const out = fn(s);
  if (out === s) { console.log('unchanged: ' + rel); return; }
  fs.writeFileSync(p, (bom ? '\uFEFF' : '') + (crlf ? out.replace(/\n/g, '\r\n') : out), 'utf8');
  console.log('updated: ' + rel);
}
for (const rel of simple) {
  rewrite(rel, (s) => s.split('2.0.11').join('2.0.12'));
}
rewrite('android/AndroidManifest.xml', (s) => s
  .replace(/android:versionCode="7"/, 'android:versionCode="8"')
  .replace(/android:versionName="2\.2\.1"/, 'android:versionName="2.0.12"'));
rewrite('android/test/static-check.js', (s) => s
  .replace('Manifest versionCode=7', 'Manifest versionCode=8')
  .replace('versionCode="7"', 'versionCode="8"')
  .replace('Manifest versionName=2.2.1', 'Manifest versionName=2.0.12')
  .replace('versionName="2\\\\.2\\\\.1"', 'versionName="2\\\\.0\\\\.12"'));
rewrite('android/README.md', (s) => s.split('2.2.0（versionCode 6）').join('2.0.12（versionCode 8）'));
rewrite('README.md', (s) => s
  .replace('Android 是独立发布的原生客户端，APK 版本以 `android/AndroidManifest.xml` 为准，当前源码与 v2.0.11 Release 内的 APK 均为 **2.2.0（versionCode 6）**。',
    'Android 与 Windows 使用同一版本号，APK 版本以 `android/AndroidManifest.xml` 为准；当前源码为 **2.0.12（versionCode 8）**，v2.0.11 Release 内的 APK 仍是旧口径（2.2.0 / 6）。'));
console.log('bump 2.0.12 done');
