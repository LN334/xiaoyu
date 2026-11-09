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
function rep(f, a, b) { if (f.s.split(a).length !== 2) throw new Error(f.rel + ' x' + (f.s.split(a).length - 1) + ': ' + a.slice(0, 70)); f.s = f.s.replace(a, b); }

// 1) UiKit: 键值网格
const kit = load('Ui/UiKit.cs');
rep(kit,
`    public static Border Kpi(KpiInfo kpi, double minWidth = 0)`,
`    public static Grid KvGrid(IEnumerable<KeyValuePair<string, string>> items, double labelWidth = 62)
    {
        var grid = new Grid { Margin = new Thickness(0, 2, 0, 0), HorizontalAlignment = HorizontalAlignment.Stretch };
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(labelWidth) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        var row = 0;
        foreach (var pair in items)
        {
            grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            var label = new TextBlock
            {
                Text = pair.Key,
                FontSize = 11,
                Foreground = Pal.Muted2,
                HorizontalAlignment = HorizontalAlignment.Right,
                Margin = new Thickness(0, 0, 8, 5),
                TextTrimming = TextTrimming.CharacterEllipsis,
            };
            var value = new TextBlock
            {
                Text = string.IsNullOrWhiteSpace(pair.Value) ? "待接入" : pair.Value,
                FontSize = 12,
                Foreground = Pal.Ink2,
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 0, 0, 5),
            };
            Grid.SetRow(label, row);
            Grid.SetColumn(label, 0);
            Grid.SetRow(value, row);
            Grid.SetColumn(value, 1);
            grid.Children.Add(label);
            grid.Children.Add(value);
            row++;
        }
        return grid;
    }

    public static Border Kpi(KpiInfo kpi, double minWidth = 0)`);
save(kit);

// 2) Dashboard: 每个单元优先显示液位/pH/DO/流量
const dash = load('Pages/DashboardPage.cs');
rep(dash,
`            var first = snap?.Readings.FirstOrDefault(r => r.Value is double && !string.IsNullOrEmpty(r.Point.Unit))
                        ?? snap?.Readings.FirstOrDefault();`,
`            static int Rank(string code)
            {
                if (code.EndsWith(".LEVEL")) return 0;
                if (code.EndsWith(".PH")) return 1;
                if (code.EndsWith(".DO")) return 2;
                if (code.Contains("FLOW")) return 3;
                return 4;
            }
            var first = snap?.Readings
                            .Where(r => r.Value is double && !string.IsNullOrEmpty(r.Point.Unit))
                            .OrderBy(r => Rank(r.Point.Code))
                            .FirstOrDefault()
                        ?? snap?.Readings.FirstOrDefault();`);
save(dash);

// 3) Devices: 详情改键值网格；去掉画蛇添足的提示
const dev = load('Pages/DevicesPage.cs');
rep(dev,
`        foreach (var pair in info)
            _detail.Children.Add(Kit.T("· " + pair.Key + "：" + (string.IsNullOrEmpty(pair.Value) ? "待接入" : pair.Value), 11, Pal.Muted, wrap: TextWrapping.Wrap));`,
`        _detail.Children.Add(Kit.KvGrid(info));`);
rep(dev,
`        var schedule = Kit.Btn("生成保养工单", () => Toast("保养工单需在工单中心由管理员创建（当前数据层未提供直接创建接口）", false), small: true);`,
`        var schedule = Kit.Btn("生成保养工单", () => Host.ShowPage("workorders"), small: true);`);
save(dev);
console.log('kv + chain + device ok');
