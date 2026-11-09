const fs = require('fs');
const base = 'D:/小禹/';
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
const plain = [
  'package.json',
  'native/ZhifuWater.Desktop/ZhifuWater.Desktop.csproj',
  'native/ZhifuWater.Kiosk/ZhifuWater.Kiosk.csproj',
  'native/installer/setup.nsi',
  'native/installer/kiosk.nsi',
  'native/ZhifuWater.Desktop/Windows/LoginWindow.xaml',
  'native/ZhifuWater.Desktop/Windows/MainWindow.xaml',
  'android/README.md',
];
for (const rel of plain) rewrite(rel, s => s.split('2.0.13').join('2.0.14'));
rewrite('android/AndroidManifest.xml', s => s
  .replace(/android:versionCode="9"/, 'android:versionCode="10"')
  .replace(/android:versionName="2\.0\.13"/, 'android:versionName="2.0.14"'));
rewrite('android/test/static-check.js', s => s
  .replace('Manifest versionCode=9', 'Manifest versionCode=10')
  .replace('versionCode="9"', 'versionCode="10"')
  .replace('Manifest versionName=2.0.13', 'Manifest versionName=2.0.14')
  .replace('2' + String.fromCharCode(92) + '.0' + String.fromCharCode(92) + '.13', '2' + String.fromCharCode(92) + '.0' + String.fromCharCode(92) + '.14'));
rewrite('README.md', s => s
  .split('2.0.13').join('2.0.14')
  .split('v2.0.12').join('v2.0.13'));
console.log('bump 2.0.14 done');
