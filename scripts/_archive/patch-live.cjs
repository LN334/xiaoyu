const fs = require('fs');
const base = 'D:/小禹/native/';
function load(rel) {
  const raw = fs.readFileSync(base + rel);
  const bom = raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF;
  let s = raw.toString('utf8'); if (bom) s = s.slice(1);
  const crlf = s.includes('\r\n');
  return { rel, bom, crlf, s: s.replace(/\r\n/g, '\n') };
}
function save(f) { let s = f.s; if (f.crlf) s = s.replace(/\n/g, '\r\n'); fs.writeFileSync(base + f.rel, (f.bom ? '\uFEFF' : '') + s, 'utf8'); }
function rep(f, a, b) { if (f.s.split(a).length !== 2) throw new Error(f.rel + ' x' + (f.s.split(a).length - 1) + ': ' + a.slice(0, 80)); f.s = f.s.replace(a, b); }

// 1) 遥测显示加传感器噪声（不影响状态机/告警判定）
const sim = load('ZhifuWater.Core/Simulator.cs');
rep(sim,
`                var v = CurrentValue(siteId, p);
                if (v is null) continue;
                var pid = J.Str(p, "id");
                _telemetry.SetLatest(pid, JsonValue.Create(v.Value), now, "good", J.Str(p, "source"));`,
`                var v = CurrentValue(siteId, p);
                if (v is null) continue;
                var pid = J.Str(p, "id");
                var shown = WithSensorNoise(J.Str(p, "code"), v.Value);
                _telemetry.SetLatest(pid, JsonValue.Create(shown), now, "good", J.Str(p, "source"));`);
rep(sim,
`                    ["v"] = v.Value,`,
`                    ["v"] = shown,`);
rep(sim,
`                _telemetry.Record(pid, JsonValue.Create(v.Value), "good", now);`,
`                _telemetry.Record(pid, JsonValue.Create(shown), "good", now);`);
rep(sim,
`    public void StepSite(string siteId, SiteState s, double dt, long now)`,
`    /// <summary>给在线仪表读数叠加小幅测量噪声，让 3 秒刷新时数值可见地跳动；不改变仿真状态与告警判定。</summary>
    private static double WithSensorNoise(string code, double value)
    {
        double noise;
        if (code.EndsWith(".LEVEL")) noise = 0.18;
        else if (code.EndsWith(".PH")) noise = 0.02;
        else if (code.EndsWith(".DO")) noise = 0.02;
        else if (code.Contains("FLOW")) noise = Math.Max(0.0015, Math.Abs(value) * 0.012);
        else if (code.EndsWith(".CURRENT")) noise = 0.02;
        else if (code.EndsWith(".DP") || code.Contains("PRESS")) noise = 0.06;
        else if (code.EndsWith(".HOURS") || code.EndsWith(".STARTS") || code.EndsWith(".COUNT")) noise = 0;
        else noise = Math.Max(0.0005, Math.Abs(value) * 0.004);
        if (noise <= 0) return value;
        return Math.Round(value + (Random.Shared.NextDouble() - 0.5) * noise, 4);
    }

    public void StepSite(string siteId, SiteState s, double dt, long now)`);
save(sim);

// 2) 主窗口刷新 5s → 3s
const mw = load('ZhifuWater.Desktop/Windows/MainWindow.xaml.cs');
rep(mw, `_refreshTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(5) };`, `_refreshTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(3) };`);
save(mw);

// 3) 看板：未布点的芯片文案与实时时间
const dash = load('ZhifuWater.Desktop/Pages/DashboardPage.cs');
rep(dash, `stack.Children.Add(Kit.T(first is null ? "待接入" : (first.Value is double dv ? dv.ToString("0.###") : first.Text), 9, Pal.Muted));`,
`stack.Children.Add(Kit.T(first is null ? "未布点" : (first.Value is double dv ? dv.ToString("0.###") : first.Text), 9, Pal.Muted));`);
rep(dash,
`        _healthText = Kit.T("数据健康检查中…", 11, Pal.Ink2, bold: true);
        health.Children.Add(_healthText);`,
`        _healthText = Kit.T("数据健康检查中…", 11, Pal.Ink2, bold: true);
        _liveText = Kit.T("", 10, Pal.Muted2);
        _liveText.Margin = new Thickness(0, 3, 0, 0);
        health.Children.Add(_healthText);
        health.Children.Add(_liveText);`);
rep(dash, `    private TextBlock _healthText = null!;`, `    private TextBlock _healthText = null!;
    private TextBlock _liveText = null!;`);
rep(dash, `        _healthText.Text = $"数据健康 · 点位在线 {health.PointsOnline}/{health.PointsTotal}（{rate}%）";`,
`        _healthText.Text = $"数据健康 · 点位在线 {health.PointsOnline}/{health.PointsTotal}（{rate}%）";
        if (_liveText != null) _liveText.Text = "实时生成 · 更新 " + DateTime.Now.ToString("HH:mm:ss");`);
save(dash);

// 4) 触摸屏刷新 5s → 3s
const kiosk = load('ZhifuWater.Desktop/Windows/KioskWindow.cs');
rep(kiosk, `new() { Interval = TimeSpan.FromSeconds(5) }`, `new() { Interval = TimeSpan.FromSeconds(3) }`);
save(kiosk);
console.log('live noise + refresh ok');
