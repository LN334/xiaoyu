const fs = require('fs');
const p = 'D:/小禹/native/ZhifuWater.Desktop/Pages/DashboardPage.cs';
let raw = fs.readFileSync(p);
const bom = raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF;
let s = raw.toString('utf8'); if (bom) s = s.slice(1);
const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n');
const rep = (a, b) => { if (s.split(a).length !== 2) throw new Error('x' + s.split(a).length + ': ' + a.slice(0, 60)); s = s.replace(a, b); };

rep('    private UniformGrid _kpiHost = null!;', '    private Grid _kpiGrid = null!;');

rep(`        var root = new StackPanel();
        root.Children.Add(BuildSiteBar());

        _kpiHost = new UniformGrid { Columns = 4, Margin = new Thickness(0, 10, 0, 0) };
        root.Children.Add(_kpiHost);

        var columns = new Grid { Margin = new Thickness(0, 10, 0, 0) };`,
`        var root = new StackPanel();
        root.Children.Add(BuildHeader());
        root.Children.Add(Gap(14));
        root.Children.Add(BuildMetrics());
        root.Children.Add(Gap(14));

        var columns = new Grid { Margin = new Thickness(0, 0, 0, 0) };`);

s = s.replace(/    private UIElement BuildSiteBar\(\)[\s\S]*?\n    }\n\n/, `    private UIElement BuildHeader()
    {
        var site = Svc.Data.Site;
        var text = new StackPanel();
        text.Children.Add(Kit.Row(10,
            Kit.T(site.Name, 19, Pal.Ink, bold: true),
            Kit.Badge(Pal.SiteStatusText(site.Status), "good"),
            Kit.T(site.Id, 11, Pal.Muted2)));
        text.Children.Add(Kit.T($"{site.Process} · 设计规模 {site.Capacity} · 投运 {site.CommissionedAt} · {site.Address}",
            11.5, Pal.Muted, wrap: TextWrapping.Wrap));

        var health = new StackPanel { VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Right };
        _healthText = Kit.T("数据健康检查中…", 11.5, Pal.Ink2, bold: true);
        _liveText = Kit.T("", 10.5, Pal.Muted2);
        _liveText.Margin = new Thickness(0, 3, 0, 0);
        health.Children.Add(_healthText);
        health.Children.Add(_liveText);

        var grid = new Grid();
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        Grid.SetColumn(text, 0);
        Grid.SetColumn(health, 1);
        grid.Children.Add(text);
        grid.Children.Add(health);
        return grid;
    }

    private UIElement BuildMetrics()
    {
        _kpiGrid = new Grid();
        for (var i = 0; i < 4; i++)
            _kpiGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        _kpiGrid.RowDefinitions.Add(new RowDefinition());
        _kpiGrid.RowDefinitions.Add(new RowDefinition());
        return new Border
        {
            Style = Kit.St("Card"),
            Padding = new Thickness(0),
            Child = _kpiGrid,
        };
    }

    private static Border Gap(double height = 10) => new() { Height = height };
`);

rep(`    private static Border Gap() => new() { Height = 10 };

`, '');

rep(`        _kpiHost.Children.Clear();
        foreach (var kpi in Svc.Data.DashboardKpis())
            _kpiHost.Children.Add(Kit.Kpi(kpi));`,
`        _kpiGrid.Children.Clear();
        var kpis = Svc.Data.DashboardKpis();
        for (var i = 0; i < kpis.Count; i++)
        {
            var row = i / 4;
            var col = i % 4;
            var cell = Kit.KpiCell(kpis[i]);
            var box = new Border
            {
                BorderBrush = Pal.Line,
                BorderThickness = new Thickness(col > 0 ? 1 : 0, row > 0 ? 1 : 0, 0, 0),
                Child = cell,
            };
            Grid.SetRow(box, Math.Min(row, 1));
            Grid.SetColumn(box, col);
            _kpiGrid.Children.Add(box);
        }`);

if (crlf) s = s.replace(/\n/g, '\r\n');
fs.writeFileSync(p, (bom ? '\uFEFF' : '') + s, 'utf8');
console.log('dashboard v2 ok');
