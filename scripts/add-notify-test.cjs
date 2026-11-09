const fs = require('fs');
const p = 'D:/小禹/native/ZhifuWater.Core.Tests/Program.cs';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('通知：全部标为已读')) { console.log('already'); process.exit(0); }
const anchor = '        /* ================= 14. 数据持久化 ================= */';
const block = [
'        /* ================= 13.5 通知已读 ================= */',
'        Section("通知：全部标为已读");',
'        var unreadBefore = J.Num(core.Admin.ListNotifications(admin, false, pageSize: 50), "unread");',
'        Check("初始存在未读通知", unreadBefore > 0, $"实际 {unreadBefore}");',
'        var marked = core.Admin.MarkNotificationsRead(admin, new JsonObject { ["all"] = true });',
'        Eq("标记后 unread=0", 0L, J.Num(marked, "unread"));',
'        Eq("再次查询 unread=0", 0L, J.Num(core.Admin.ListNotifications(admin, false, pageSize: 50), "unread"));',
'',
''].join('\n');
s = s.replace(anchor, block + anchor);
fs.writeFileSync(p, s, 'utf8');
console.log('notification test added');
