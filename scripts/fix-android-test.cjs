const fs = require('fs');
const p = 'D:/小禹/android/test/static-check.js';
let s = fs.readFileSync(p, 'utf8');
s = s.split('android:versionName="2\\.2\\.0"').join('android:versionName="2\\.2\\.1"');
fs.writeFileSync(p, s, 'utf8');
console.log(s.includes('2\\.2\\.1') ? 'fixed' : 'still missing');
