const fs = require('fs');
const p = 'D:/小禹/native/ZhifuWater.Desktop/App.xaml.cs';
let raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let s = raw.replace(/\r\n/g, '\n');
if (s.includes('--assignment-demo')) { console.log('already'); process.exit(0); }
const anchor = `        if (smoke || shots)`;
const block = `        var assignmentDemo = e.Args.Any(a => string.Equals(a, "--assignment-demo", StringComparison.OrdinalIgnoreCase));
        if (assignmentDemo)
        {
            var demoItem = new Data.NotificationInfo
            {
                Id = "NT-DEMO",
                Kind = "workorder",
                Title = "工单已指派：BAF 曝气风机电流偏高排查",
                Body = "高优先级 · 截止 11-04 21:30",
            };
            var dlg = new Windows.AssignmentDialog(null, demoItem, 2);
            var shot = e.Args.FirstOrDefault(a => a.StartsWith("--shot=", StringComparison.OrdinalIgnoreCase));
            if (shot == null)
            {
                dlg.ShowDialog();
            }
            else
            {
                dlg.Show();
                var timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(900) };
                timer.Tick += (_, _) =>
                {
                    timer.Stop();
                    try { Smoke.CaptureElement(dlg, (int)dlg.ActualWidth, (int)dlg.ActualHeight, shot.Substring("--shot=".Length)); }
                    catch { }
                    dlg.Close();
                    Shutdown(0);
                };
                timer.Start();
            }
            if (shot == null) Shutdown(0);
            return;
        }

        if (smoke || shots)`;
if (!s.includes(anchor)) { console.log('anchor missing'); process.exit(1); }
s = s.replace(anchor, block);
if (crlf) s = s.replace(/\n/g, '\r\n');
fs.writeFileSync(p, s, 'utf8');
console.log('assignment demo added');
