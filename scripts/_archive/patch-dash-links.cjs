const fs = require('fs');
const base = 'D:/小禹/native/ZhifuWater.Desktop/';

function load(rel) {
  const raw = fs.readFileSync(base + rel);
  const bom = raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF;
  let s = raw.toString('utf8');
  if (bom) s = s.slice(1);
  const crlf = s.includes('\r\n');
  return { rel, bom, crlf, s: s.replace(/\r\n/g, '\n') };
}
function save(f) {
  let s = f.s;
  if (f.crlf) s = s.replace(/\n/g, '\r\n');
  fs.writeFileSync(base + f.rel, (f.bom ? '\uFEFF' : '') + s, 'utf8');
}
function rep(f, a, b) {
  if (f.s.split(a).length !== 2) throw new Error(f.rel + ' x' + (f.s.split(a).length - 1) + ': ' + a.slice(0, 70));
  f.s = f.s.replace(a, b);
}

const kit = load('Ui/UiKit.cs');
rep(kit,
`    public static Button Btn(string text, Action click, bool primary = false, bool small = false, bool danger = false)`,
`    public static Button Link(string text, Action click)
    {
        var btn = new Button
        {
            Content = text,
            Style = St("LinkButton"),
            FontSize = 11,
            Height = 20,
            Padding = new Thickness(0),
            MinWidth = 0,
            Cursor = System.Windows.Input.Cursors.Hand,
        };
        btn.Click += (_, _) => click();
        return btn;
    }

    public static Button Btn(string text, Action click, bool primary = false, bool small = false, bool danger = false)`);
save(kit);

const dash = load('Pages/DashboardPage.cs');
rep(dash, `Kit.Btn("全部诊断", () => Host.ShowPage("diagnosis"), small: true)`, `Kit.Link("全部诊断", () => Host.ShowPage("diagnosis"))`);
rep(dash, `Kit.Btn("告警中心", () => Host.ShowPage("alarms"), small: true)`, `Kit.Link("告警中心", () => Host.ShowPage("alarms"))`);
rep(dash, `Kit.Btn("工单管理", () => Host.ShowPage("workorders"), small: true)`, `Kit.Link("工单管理", () => Host.ShowPage("workorders"))`);
rep(dash, `Kit.Btn("设备台账", () => Host.ShowPage("devices"), small: true)`, `Kit.Link("设备台账", () => Host.ShowPage("devices"))`);
rep(dash,
`            var first = snap?.Readings.FirstOrDefault();`,
`            var first = snap?.Readings.FirstOrDefault(r => r.Value is double && !string.IsNullOrEmpty(r.Point.Unit))
                        ?? snap?.Readings.FirstOrDefault();`);
save(dash);
console.log('links + reading pick ok');
