const fs = require('fs');
const p = 'D:/小禹/native/ZhifuWater.Desktop/Windows/MainWindow.xaml.cs';
let raw = fs.readFileSync(p);
const bom = raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF;
let s = raw.toString('utf8'); if (bom) s = s.slice(1);
const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n');
const rep = (a, b) => { if (s.split(a).length !== 2) throw new Error('x' + s.split(a).length + ': ' + a.slice(0, 60)); s = s.replace(a, b); };

rep('using System.Windows.Controls;\nusing System.Windows.Threading;',
    'using System.Windows.Controls;\nusing System.Windows.Media;\nusing System.Windows.Shapes;\nusing System.Windows.Threading;');

rep('    private readonly Dictionary<string, (Border Box, TextBlock Text)> _navBadges = new();',
`    private readonly Dictionary<string, (Border Box, TextBlock Text)> _navBadges = new();
    private readonly Dictionary<string, Path> _navIcons = new();

    private static readonly Dictionary<string, string> NavIconData = new()
    {
        ["dashboard"] = "M2,2 H7 V7 H2 Z M9,2 H14 V7 H9 Z M2,9 H7 V14 H2 Z M9,9 H14 V14 H9 Z",
        ["process"] = "M2,8 H5 M5,4 H10 V12 H14 M5,12 H10",
        ["monitor"] = "M2,10 H5 L7,4 L10,12 L12,8 H14",
        ["alarms"] = "M8,2 A4,4 0 0 1 12,6 V9 L13,11 H3 L4,9 V6 A4,4 0 0 1 8,2 Z M6.5,13 A1.5,1.5 0 0 0 9.5,13",
        ["control"] = "M3,5 H13 M3,11 H13 M6,3 V7 M10,9 V13",
        ["params"] = "M3,4 H13 M3,8 H13 M3,12 H13 M6,2 V6 M10,6 V10 M6,10 V14",
        ["quality"] = "M8,2 C8,2 13,8 13,11 A5,5 0 0 1 3,11 C3,8 8,2 8,2 Z",
        ["diagnosis"] = "M7,2 A5,5 0 1 0 7,12 A5,5 0 1 0 7,2 Z M11,11 L14,14",
        ["analysis"] = "M2,14 H14 M4,12 V8 M8,12 V4 M12,12 V6",
        ["reports"] = "M3,2 H10 L13,5 V14 H3 Z M10,2 V5 H13 M5,8 H11 M5,11 H9",
        ["workorders"] = "M4,3 H12 V14 H4 Z M6,1.5 H10 V4 H6 Z M6,7 H10 M6,10 H10",
        ["inspections"] = "M3,8 L6,11 L13,3",
        ["devices"] = "M3,4 H13 V12 H3 Z M6,4 V2 M10,4 V2",
        ["admin"] = "M8,5 A3,3 0 1 0 8,11 A3,3 0 1 0 8,5 Z M8,1 V3 M8,13 V15 M1,8 H3 M13,8 H15",
    };`);

rep(`            var label = new TextBlock
            {
                Text = title,
                VerticalAlignment = VerticalAlignment.Center,
                Foreground = Kit.Br("SidebarText"),
            };`,
`            var label = new TextBlock
            {
                Text = title,
                VerticalAlignment = VerticalAlignment.Center,
                Foreground = Kit.Br("SidebarText"),
            };
            var icon = new Path
            {
                Data = Geometry.Parse(NavIconData.TryGetValue(id, out var d) ? d : NavIconData["dashboard"]),
                Stroke = Kit.Br("SidebarText"),
                StrokeThickness = 1.4,
                Stretch = Stretch.Uniform,
                Width = 15,
                Height = 15,
                Margin = new Thickness(0, 0, 10, 0),
                VerticalAlignment = VerticalAlignment.Center,
            };`);

rep(`            var grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            Grid.SetColumn(label, 0);
            Grid.SetColumn(badge, 1);
            grid.Children.Add(label);
            grid.Children.Add(badge);`,
`            var grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            Grid.SetColumn(icon, 0);
            Grid.SetColumn(label, 1);
            Grid.SetColumn(badge, 2);
            grid.Children.Add(icon);
            grid.Children.Add(label);
            grid.Children.Add(badge);`);

rep(`            NavPanel.Children.Add(button);
            _navButtons[id] = button;
            _navLabels[id] = label;
            _navBadges[id] = (badge, badgeText);`,
`            NavPanel.Children.Add(button);
            _navButtons[id] = button;
            _navLabels[id] = label;
            _navBadges[id] = (badge, badgeText);
            _navIcons[id] = icon;`);

rep(`        foreach (var (key, label) in _navLabels)
            label.Foreground = key == id ? System.Windows.Media.Brushes.White : Kit.Br("SidebarText");`,
`        foreach (var (key, label) in _navLabels)
            label.Foreground = key == id ? Brushes.White : Kit.Br("SidebarText");
        foreach (var (key, icon) in _navIcons)
            icon.Stroke = key == id ? Kit.Br("SidebarText") : Kit.Br("SidebarMuted");`);

if (crlf) s = s.replace(/\n/g, '\r\n');
fs.writeFileSync(p, (bom ? '\uFEFF' : '') + s, 'utf8');
console.log('nav icons ok');
