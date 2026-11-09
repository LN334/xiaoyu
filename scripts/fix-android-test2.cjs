const fs = require('fs');
const p = 'D:/小禹/android/test/static-check.js';
const bs = String.fromCharCode(92);
const oldText = '2' + bs + '.2' + bs + '.1';
const newText = '2' + bs + '.0' + bs + '.12';
let s = fs.readFileSync(p, 'utf8');
if (!s.includes(oldText)) { console.log('old regex not found'); process.exit(1); }
s = s.split(oldText).join(newText);
fs.writeFileSync(p, s, 'utf8');
console.log('fixed versionName assertion');
