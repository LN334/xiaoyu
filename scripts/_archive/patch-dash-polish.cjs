const fs = require('fs');
const p = 'D:/小禹/native/ZhifuWater.Desktop/Pages/DashboardPage.cs';
let raw = fs.readFileSync(p);
const bom = raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF;
let s = raw.toString('utf8');
if (bom) s = s.slice(1);
const crlf = s.includes('\r\n');
s = s.replace(/\r\n/g, '\n');

function rep(a, b) {
  if (s.split(a).length !== 2) throw new Error('anchor x' + (s.split(a).length - 1) + ': ' + a.slice(0, 70));
  s = s.replace(a, b);
}

// 站点条：去掉说明性小字
rep(`        left.Children.Add(Kit.T(site.Note, 11, Pal.Muted2, wrap: TextWrapping.Wrap));\n`, ``);
rep(`        health.Children.Add(Kit.T("网关 / 点位在线率 / 最新采集", 10, Pal.Muted2));\n`, ``);

// 工艺链小卡：加宽、去掉箭头、靠间距分隔
rep(`                Width = 56,`, `                Width = 62,`);
rep(`            box.Child = stack;\n            box.MouseLeftButtonUp += (_, _) => Host.ShowPage("process");\n            _chainPanel.Children.Add(box);\n            if (i < units.Count - 1)\n                _chainPanel.Children.Add(Kit.T("›", 8, Pal.Muted2));`,
`            box.Child = stack;\n            box.Margin = new Thickness(0, 0, 4, 0);\n            box.MouseLeftButtonUp += (_, _) => Host.ShowPage("process");\n            _chainPanel.Children.Add(box);`);

// 趋势图：右侧留白，避免最后一个时间刻度贴边
rep(`        return Kit.Card("24 小时关键趋势", _trend, chips, null, new Thickness(8, 4, 8, 4));`,
`        var trendBody = new Border { Padding = new Thickness(0, 0, 12, 0), Child = _trend };\n        return Kit.Card("24 小时关键趋势", trendBody, chips, null, new Thickness(8, 4, 8, 4));`);

// 设备健康：健康列加宽，避免 “68 …” 截断
rep(`new double[] { 0, 100, 52, 58 }`, `new double[] { 0, 92, 78, 58 }`);

if (crlf) s = s.replace(/\n/g, '\r\n');
fs.writeFileSync(p, (bom ? '\uFEFF' : '') + s, 'utf8');
console.log('dashboard polished');
