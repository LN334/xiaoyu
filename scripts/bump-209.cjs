const fs = require('fs');
const base = 'D:/小禹/';
const files = [
  'package.json',
  'native/ZhifuWater.Desktop/ZhifuWater.Desktop.csproj',
  'native/ZhifuWater.Kiosk/ZhifuWater.Kiosk.csproj',
  'native/installer/setup.nsi',
  'native/installer/kiosk.nsi',
  'native/ZhifuWater.Desktop/Windows/LoginWindow.xaml',
  'native/ZhifuWater.Desktop/Windows/MainWindow.xaml',
  'README.md',
];
for (const rel of files) {
  const p = base + rel;
  const raw = fs.readFileSync(p);
  const bom = raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF;
  let s = raw.toString('utf8'); if (bom) s = s.slice(1);
  const crlf = s.includes('\r\n');
  s = s.replace(/\r\n/g, '\n');
  if (!s.includes('2.0.8')) { console.log('skip (no 2.0.8): ' + rel); continue; }
  s = s.split('2.0.8').join('2.0.9');
  if (crlf) s = s.replace(/\n/g, '\r\n');
  fs.writeFileSync(p, (bom ? '\uFEFF' : '') + s, 'utf8');
  console.log('bumped: ' + rel);
}

// README: kiosk refresh interval
const rp = base + 'README.md';
let raw = fs.readFileSync(rp);
const bom = raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF;
let s = raw.toString('utf8'); if (bom) s = s.slice(1);
const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n');
s = s.replace('5 秒自动刷新', '3 秒自动刷新');
if (crlf) s = s.replace(/\n/g, '\r\n');
fs.writeFileSync(rp, (bom ? '\uFEFF' : '') + s, 'utf8');
console.log('readme refresh text updated');
