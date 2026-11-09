const fs = require('fs');
const p = 'D:/小禹/native/ZhifuWater.Desktop/Pages/ParamsPage.cs';
let raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let s = raw.replace(/\r\n/g, '\n');
const old = `        _detail.Children.Add(Kit.Divider(4, 4));
        _detail.Children.Add(Kit.T("版本历史", 11, Pal.Ink, bold: true));
        var versions = Table(new[] { "版本", "值", "时间", "操作人", "原因" }, new double[] { 44, 76, 112, 88, 0 });
        versions.RowHeight = 26;
        versions.ItemsSource = p.Versions.Select(v => Kit.R(
            Kit.C("v" + v.Version, "muted"),
            Kit.C((IsModeParam(p) ? ParamValueText(p) : Fmt(v.Value, ParamDigits(p))) + (p.Unit.Length > 0 ? " " + p.Unit : ""), "normal"),
            Kit.C(v.At, "muted"),
            Kit.C(v.By, "muted"),
            Kit.C(v.Reason, "muted"))).ToList();
        versions.MaxHeight = 180;
        _detail.Children.Add(versions);`;
if (!s.includes(old)) { console.log('anchor missing'); process.exit(1); }
const neu = `        _detail.Children.Add(Kit.Divider(4, 4));
        _detail.Children.Add(Kit.T("版本历史", 11, Pal.Ink, bold: true));
        foreach (var v in p.Versions.Take(6))
        {
            var head = new Grid();
            head.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            head.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            head.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            var ver = Kit.T("v" + v.Version, 10.5, Pal.Muted2, bold: true);
            ver.Margin = new Thickness(0, 0, 8, 0);
            var val = Kit.T((IsModeParam(p) ? ParamValueText(p) : Fmt(v.Value, ParamDigits(p))) +
                            (p.Unit.Length > 0 ? " " + p.Unit : ""), 11.5, Pal.Ink, bold: true);
            var at = Kit.T(string.IsNullOrEmpty(v.At) ? "时间未知" : v.At, 10.5, Pal.Muted2);
            Grid.SetColumn(ver, 0);
            Grid.SetColumn(val, 1);
            Grid.SetColumn(at, 2);
            head.Children.Add(ver);
            head.Children.Add(val);
            head.Children.Add(at);

            var sub = Kit.T("操作人 " + (string.IsNullOrEmpty(v.By) ? "—" : v.By) +
                            " · 原因 " + (string.IsNullOrEmpty(v.Reason) ? "—" : v.Reason),
                10.5, Pal.Muted, wrap: TextWrapping.Wrap);
            sub.Margin = new Thickness(0, 3, 0, 0);
            var item = new StackPanel();
            item.Margin = new Thickness(0, 6, 0, 6);
            item.Children.Add(head);
            item.Children.Add(sub);
            _detail.Children.Add(item);
            _detail.Children.Add(Kit.Divider(0, 0));
        }`;
s = s.replace(old, neu);
if (crlf) s = s.replace(/\n/g, '\r\n');
fs.writeFileSync(p, s, 'utf8');
console.log('history list built');
