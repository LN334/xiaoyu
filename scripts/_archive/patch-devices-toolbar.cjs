const fs = require('fs');
const base = 'D:/小禹/native/ZhifuWater.Desktop/';
function load(rel) {
  const raw = fs.readFileSync(base + rel);
  const bom = raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF;
  let s = raw.toString('utf8'); if (bom) s = s.slice(1);
  const crlf = s.includes('\r\n');
  return { rel, bom, crlf, s: s.replace(/\r\n/g, '\n') };
}
function save(f) { let s = f.s; if (f.crlf) s = s.replace(/\n/g, '\r\n'); fs.writeFileSync(base + f.rel, (f.bom ? '\uFEFF' : '') + s, 'utf8'); }
function rep(f, a, b) { if (f.s.split(a).length !== 2) throw new Error(f.rel + ' x' + (f.s.split(a).length - 1) + ': ' + a.slice(0, 80)); f.s = f.s.replace(a, b); }

const dev = load('Pages/DevicesPage.cs');

rep(dev,
`        var head = new StackPanel();
        head.Children.Add(_info);
        head.Children.Add(bar);
        head.Children.Add(Kit.T("台账包含设备型号、规格、安装位置、PLC 地址、维护周期与健康度；维护登记后健康度自动更新并写入审计。",
            11, Pal.Muted2, wrap: TextWrapping.Wrap));
        root.Children.Add(Kit.Card(null, head, null, null, new Thickness(12, 9, 12, 9)));`,
`        var toolbarInner = new Grid();
        toolbarInner.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        toolbarInner.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        _info.VerticalAlignment = VerticalAlignment.Center;
        bar.VerticalAlignment = VerticalAlignment.Center;
        bar.Margin = new Thickness(0);
        Grid.SetColumn(_info, 0);
        Grid.SetColumn(bar, 1);
        toolbarInner.Children.Add(_info);
        toolbarInner.Children.Add(bar);
        root.Children.Add(new Border
        {
            Background = Pal.Surface,
            BorderBrush = Pal.Line,
            BorderThickness = new Thickness(1),
            Padding = new Thickness(12, 8, 12, 8),
            Child = toolbarInner,
        });`);

rep(dev,
`        var tableCard = Kit.Card("设备列表", _table, Kit.T("在线 + 离线", 10, Pal.Muted2), null, new Thickness(10, 8, 10, 8));`,
`        var tableCard = Kit.Card("设备列表", _table, null, null, new Thickness(10, 8, 10, 8));`);

rep(dev,
`            ["型号规格"] = d.Model + (d.Spec.Length > 0 ? " / " + d.Spec : ""),
            ["健康度"] = d.Health + "%（" + d.HealthText + "）",
            ["运行小时"] = d.RuntimeHours.ToString("F0") + " 小时 · 启动 " + d.Starts + " 次",
            ["安装位置"] = d.PlAddress,`,
`            ["型号规格"] = d.Model + (d.Spec.Length > 0 ? " / " + d.Spec : ""),
            ["健康度"] = d.Health + "%（" + d.HealthText + "）",
            ["运行时长"] = d.RuntimeHours.ToString("F0") + " 小时 · 启动 " + d.Starts + " 次",
            ["PLC 地址"] = d.PlAddress,`);

save(dev);
console.log('devices toolbar ok');
