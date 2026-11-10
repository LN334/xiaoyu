const fs = require('fs');
const p = 'D:/小禹/native/ZhifuWater.Desktop/Windows/MainWindow.xaml.cs';
let raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let s = raw.replace(/\r\n/g, '\n');
// restore Loaded line without debug marker
s = s.replace(/Loaded \+= \(_, _\) => \{.*?\};/, 'Loaded += (_, _) => { UpdateBadges(); WatchAssignments(); ScheduleStartupUpdateCheck(); };');
// guard before try in WatchAssignments
s = s.replace('    private void WatchAssignments()\n    {\n        try', '    private void WatchAssignments()\n    {\n        if (!IsLoaded) return;\n        try');
if (crlf) s = s.replace(/\n/g, '\r\n');
fs.writeFileSync(p, s, 'utf8');
console.log('guard applied');
