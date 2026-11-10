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

// 1) 接口
const iface = load('Data/IDesktopData.cs');
rep(iface, `    OpResult ReviewLab(string id, bool approve);`,
`    OpResult ReviewLab(string id, bool approve);
    OpResult CreateLab(string samplePoint, IReadOnlyDictionary<string, double> metrics, string? method = null);`);
save(iface);

// 2) Core 实现
const core = load('Data/CoreDesktopData.cs');
rep(core, `    public OpResult ReviewLab(string id, bool approve)
    {`,
`    public OpResult CreateLab(string samplePoint, IReadOnlyDictionary<string, double> metrics, string? method = null)
    {
        try
        {
            var m = new JsonObject();
            foreach (var kv in metrics) m[kv.Key] = kv.Value;
            _core.Ops.CreateLab(_user, new JsonObject
            {
                ["samplePoint"] = samplePoint,
                ["metrics"] = m,
                ["method"] = method ?? "",
            }, "desktop");
            Refresh();
            return OpResult.Done("化验记录已提交，等待复核");
        }
        catch (CoreException ex) { return OpResult.Fail(ex.Message); }
    }

    public OpResult ReviewLab(string id, bool approve)
    {`);
save(core);

// 3) Demo 实现
const demo = load('Data/DemoDesktopData.Content.cs');
rep(demo, `    public OpResult ReviewLab(string id, bool approve)
    {`,
`    public OpResult CreateLab(string samplePoint, IReadOnlyDictionary<string, double> metrics, string? method = null)
    {
        if (_user?.Can("inspection.execute") != true) return OpResult.Fail("当前账号无化验录入权限");
        var names = new Dictionary<string, string>
        {
            ["inlet"] = "进水（原料罐）",
            ["baf_out"] = "BAF 出水",
            ["sulfur_out"] = "硫自养池出水",
            ["outlet"] = "总出水（清水池）",
        };
        if (!names.ContainsKey(samplePoint)) return OpResult.Fail("取样点不合法");
        if (metrics.Count == 0) return OpResult.Fail("请至少填写一项检测指标");
        var rec = new LabRecord
        {
            Id = "LAB-DEMO-" + DateTime.Now.ToString("yyyyMMddHHmmss"),
            SiteId = _siteId,
            SamplePoint = samplePoint,
            SamplePointName = names[samplePoint],
            SampledAt = DateTimeOffset.Now.ToUnixTimeMilliseconds(),
            Status = "pending_review",
            Recorder = _user.Name,
            Remark = method ?? "",
        };
        foreach (var kv in metrics) rec.Metrics[kv.Key] = kv.Value;
        Rt.Labs.Insert(0, rec);
        RecordAudit("lab.create", "lab", rec.Id, "录入化验：" + rec.SamplePointName);
        Touch();
        return OpResult.Done("化验记录已提交，等待复核");
    }

    public OpResult ReviewLab(string id, bool approve)
    {`);
save(demo);

// 4) 页面按钮与弹窗
const page = load('Pages/QualityPage.cs');
rep(page, `        var buttons = Kit.Row(6,
            Kit.Btn("复核通过", () => Review(true), primary: true, small: true),
            Kit.Btn("退回重检", () => Review(false), small: true),
            Kit.T("仅待复核记录可操作", 10, Pal.Muted2));`,
`        var buttons = Kit.Row(6,
            Kit.Btn("录入化验", CreateLab, primary: true, small: true),
            Kit.Btn("复核通过", () => Review(true), small: true),
            Kit.Btn("退回重检", () => Review(false), small: true),
            Kit.T("录入后进入待复核", 10, Pal.Muted2));`);
rep(page, `    private void Review(bool approve)`,
`    private void CreateLab()
    {
        if (!Svc.Can("inspection.execute")) { Toast("当前账号无化验录入权限", false); return; }
        var dlg = new FormDialog(Host, "录入化验", "至少填写一项指标；提交后进入待复核。");
        var point = dlg.AddCombo("取样点", new[] { "进水（原料罐）", "BAF 出水", "硫自养池出水", "总出水（清水池）" }, 3);
        var cod = dlg.AddText("COD（mg/L）", "", "选填");
        var nh3 = dlg.AddText("氨氮（mg/L）", "", "选填");
        var tn = dlg.AddText("总氮（mg/L）", "", "选填");
        var tp = dlg.AddText("总磷（mg/L）", "", "选填");
        var ss = dlg.AddText("悬浮物（mg/L）", "", "选填");
        var method = dlg.AddText("检测方法", "", "留空使用标准方法");
        if (!dlg.Ask("提交", validate: () =>
            {
                var boxes = new[] { cod, nh3, tn, tp, ss };
                var filled = 0;
                foreach (var b in boxes)
                {
                    if (string.IsNullOrWhiteSpace(b.Text)) continue;
                    if (!double.TryParse(b.Text, out var v) || v < 0) return "指标必须是非负数字";
                    filled++;
                }
                if (filled == 0) return "至少填写一项指标";
                return null;
            })) return;

        var map = new Dictionary<string, double>();
        void Put(string key, TextBox box)
        {
            if (string.IsNullOrWhiteSpace(box.Text)) return;
            map[key] = double.Parse(box.Text.Trim());
        }
        Put("COD", cod); Put("NH3N", nh3); Put("TN", tn); Put("TP", tp); Put("SS", ss);
        var keys = new[] { "inlet", "baf_out", "sulfur_out", "outlet" };
        var result = Svc.Data.CreateLab(keys[Math.Max(0, point.SelectedIndex)], map, string.IsNullOrWhiteSpace(method.Text) ? null : method.Text.Trim());
        Toast(result.Message, result.Ok);
        RefreshData();
    }

    private void Review(bool approve)`);
save(page);
console.log('lab entry added');
