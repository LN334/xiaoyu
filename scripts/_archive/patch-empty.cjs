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
`        var bar = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 7, 0, 0) };
        foreach (var (key, text) in new[] { ("all", "全部"), ("online", "在线"), ("offline", "离线"), ("attention", "需关注") })
        {
            var k = key;
            var b = new Button { Content = text, Style = Kit.St("TabButton"), Margin = new Thickness(0, 0, 4, 0) };
            b.Click += (_, _) =>
            {
                _filter = k;
                RefreshData();
            };
            bar.Children.Add(b);
        }`,
`        var filterKeys = new[] { "all", "online", "offline", "attention" };
        var bar = new StackPanel { Orientation = Orientation.Horizontal };
        bar.Children.Add(Kit.Segments(new[] { "全部", "在线", "离线", "需关注" }, 0, index =>
        {
            _filter = filterKeys[index];
            RefreshData();
        }));`);
save(dev);

const wo = load('Pages/WorkordersPage.cs');
rep(wo,
`        var tableCard = Kit.Card("工单列表", _table, null, null, new Thickness(10, 8, 10, 8));`,
`        var tableHost = new Grid();
        tableHost.Children.Add(_table);
        _emptyPanel = new StackPanel
        {
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(0, 36, 0, 0),
            Visibility = Visibility.Collapsed,
        };
        _emptyPanel.Children.Add(Kit.T("没有符合条件的工单", 13, Pal.Muted));
        tableHost.Children.Add(_emptyPanel);
        var tableCard = Kit.Card("工单列表", tableHost, null, null, new Thickness(10, 8, 10, 8));`);
rep(wo,
`    private DataGrid _table = null!;`,
`    private DataGrid _table = null!;
    private StackPanel _emptyPanel = null!;`);
rep(wo,
`        _table.ItemsSource = rows;`,
`        _table.ItemsSource = rows;
        if (_emptyPanel != null)
            _emptyPanel.Visibility = rows.Count == 0 ? Visibility.Visible : Visibility.Collapsed;`);
save(wo);
console.log('segments + empty state ok');
