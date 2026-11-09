const fs = require('fs');
const root = 'D:/小禹/native/ZhifuWater.Desktop/';
function load(rel) {
  const raw = fs.readFileSync(root + rel);
  const bom = raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF;
  let s = raw.toString('utf8'); if (bom) s = s.slice(1);
  const crlf = s.includes('\r\n');
  return { rel, bom, crlf, s: s.replace(/\r\n/g, '\n') };
}
function save(f) { let s = f.s; if (f.crlf) s = s.replace(/\n/g, '\r\n'); fs.writeFileSync(root + f.rel, (f.bom ? '\uFEFF' : '') + s, 'utf8'); }
function rep(f, a, b) { if (f.s.split(a).length !== 2) throw new Error(f.rel + ' x' + (f.s.split(a).length - 1) + ': ' + a.slice(0, 60)); f.s = f.s.replace(a, b); }

// 模型
const models = load('Data/Models.cs');
rep(models, `public sealed class InspectionInfo`, `public sealed class InspectionItemInput
{
    public string Key { get; set; } = "";
    public string Result { get; set; } = "ok";
    public string Note { get; set; } = "";
}

public sealed class InspectionInfo`);
save(models);

// 接口
const api = load('Data/IDesktopData.cs');
rep(api, `    OpResult SubmitInspection(string id, string summary, int abnormal);`,
`    OpResult SubmitInspection(string id, string summary, IReadOnlyList<InspectionItemInput> items);`);
save(api);

// Core 包装
const core = load('Data/CoreDesktopData.cs');
rep(core, `    public OpResult SubmitInspection(string id, string summary, int abnormal)
    {
        try
        {
            var detail = _core.Ops.InspectionDetail(_user, id);
            var items = new JsonArray();
            var i = 0;
            foreach (var it in J.Objs(J.Get(detail, "items")))
            {
                var result = i < abnormal ? "abnormal" : "ok";
                items.Add(new JsonObject { ["key"] = J.Str(it, "key"), ["result"] = result, ["note"] = i < abnormal ? "现场发现异常，已记录" : "" });
                i++;
            }
            _core.Ops.SubmitInspection(_user, id, new JsonObject { ["summary"] = summary, ["items"] = items }, "desktop");
            Refresh();
            return OpResult.Done("巡检结果已提交" + (abnormal > 0 ? "，异常项已自动建单" : ""));
        }
        catch (CoreException ex) { return OpResult.Fail(ex.Message); }
    }`,
`    public OpResult SubmitInspection(string id, string summary, IReadOnlyList<InspectionItemInput> inputs)
    {
        try
        {
            var items = new JsonArray();
            foreach (var input in inputs)
                items.Add(new JsonObject { ["key"] = input.Key, ["result"] = input.Result, ["note"] = input.Note });
            _core.Ops.SubmitInspection(_user, id, new JsonObject { ["summary"] = summary, ["items"] = items }, "desktop");
            Refresh();
            var bad = inputs.Count(x => x.Result == "abnormal");
            return OpResult.Done("巡检结果已提交" + (bad > 0 ? "，异常项已自动建单" : ""));
        }
        catch (CoreException ex) { return OpResult.Fail(ex.Message); }
    }`);
save(core);

// Demo 实现
const demo = load('Data/DemoDesktopData.Content.cs');
rep(demo, `    public OpResult SubmitInspection(string id, string summary, int abnormal)
    {
        if (_user?.Can("inspection.execute") != true) return OpResult.Fail("当前账号无巡检执行权限");
        var ins = Rt.Inspections.FirstOrDefault(i => i.Id == id);
        if (ins == null) return OpResult.Fail("巡检任务不存在");
        if (ins.Status == "done") return OpResult.Fail("该巡检已提交");
        ins.Status = "done";
        ins.DoneAt = Ms(DateTime.Now);
        ins.Summary = summary;
        ins.Abnormal = abnormal;
        ins.Assignee = _user.Name;
        RecordAudit("inspection.submit", "inspection", id, ins.Plan + "：" + summary);
        Touch();
        return OpResult.Done("巡检结果已提交");
    }`,
`    public OpResult SubmitInspection(string id, string summary, IReadOnlyList<InspectionItemInput> inputs)
    {
        if (_user?.Can("inspection.execute") != true) return OpResult.Fail("当前账号无巡检执行权限");
        var ins = Rt.Inspections.FirstOrDefault(i => i.Id == id);
        if (ins == null) return OpResult.Fail("巡检任务不存在");
        if (ins.Status == "done") return OpResult.Fail("该巡检已提交");
        foreach (var input in inputs)
        {
            var item = ins.Items.FirstOrDefault(x => x.Key == input.Key);
            if (item == null) continue;
            item.Result = input.Result;
            item.Note = input.Note;
        }
        ins.Status = "done";
        ins.DoneAt = Ms(DateTime.Now);
        ins.Summary = summary;
        ins.Abnormal = inputs.Count(x => x.Result == "abnormal");
        ins.Assignee = _user.Name;
        RecordAudit("inspection.submit", "inspection", id, ins.Plan + "：" + summary);
        Touch();
        return OpResult.Done("巡检结果已提交");
    }`);
save(demo);

// 巡检页：逐项判定
const page = load('Pages/InspectionsPage.cs');
rep(page, `        var dlg = new FormDialog(Host, "提交巡检结果", _selected.Plan);
        dlg.AddMessage("请确认 8 项检查均已完成。", "warn");
        var summary = dlg.AddText("巡检结论（必填）", "设备运行正常，无异常项", "概述现场检查情况");
        var abnormalBox = dlg.AddText("异常项数量", "0", "0 - 8");
        if (!dlg.Ask("提交", validate: () =>
            {
                if (string.IsNullOrWhiteSpace(summary.Text) || summary.Text.Trim().Length < 3) return "请填写巡检结论（至少 3 个字）";
                if (!int.TryParse(abnormalBox.Text, out var n) || n < 0 || n > 8) return "异常项数量需为 0 – 8";
                return null;
            })) return;
        var result = Svc.Data.SubmitInspection(_selected.Id, summary.Text.Trim(), int.Parse(abnormalBox.Text));`,
`        var ins = _selected;
        var dlg = new FormDialog(Host, "提交巡检结果", ins.Plan);
        dlg.AddMessage("逐项判定；标记为「异常」的项会自动生成工单。", "warn");
        var choices = new[] { "正常", "关注", "异常" };
        var combos = new List<(InspectionItem Item, ComboBox Box)>();
        foreach (var item in ins.Items)
        {
            var box = dlg.AddCombo(item.Name, choices, item.Result == "abnormal" ? 2 : item.Result == "attention" ? 1 : 0);
            combos.Add((item, box));
        }
        var note = dlg.AddText("异常说明（可选）", "", "例：曝气风机电流偏高，已安排检修");
        var summary = dlg.AddText("巡检结论（必填）", "", "概述现场检查情况");
        if (!dlg.Ask("提交", validate: () =>
            {
                if (string.IsNullOrWhiteSpace(summary.Text) || summary.Text.Trim().Length < 3) return "请填写巡检结论（至少 3 个字）";
                return null;
            })) return;
        var items = combos.Select(c => new InspectionItemInput
        {
            Key = c.Item.Key,
            Result = c.Box.SelectedIndex switch { 2 => "abnormal", 1 => "attention", _ => "ok" },
            Note = c.Box.SelectedIndex == 2 ? note.Text.Trim() : "",
        }).ToList();
        var result = Svc.Data.SubmitInspection(ins.Id, summary.Text.Trim(), items);`);
save(page);

// 报表：月报与自定义范围
const api2 = load('Data/IDesktopData.cs');
rep(api2, `    OpResult GenerateReport(string type);`,
`    OpResult GenerateReport(string type, string? from = null, string? to = null, string? title = null);`);
save(api2);

const core2 = load('Data/CoreDesktopData.cs');
rep(core2, `    public OpResult GenerateReport(string type)
    {
        try
        {
            var r = _core.Reports.CreateReport(_user, new JsonObject { ["type"] = type, ["siteId"] = _siteId }, "desktop");`,
`    public OpResult GenerateReport(string type, string? from = null, string? to = null, string? title = null)
    {
        try
        {
            var body = new JsonObject { ["type"] = type, ["siteId"] = _siteId };
            if (!string.IsNullOrWhiteSpace(from)) body["from"] = from;
            if (!string.IsNullOrWhiteSpace(to)) body["to"] = to;
            if (!string.IsNullOrWhiteSpace(title)) body["title"] = title;
            var r = _core.Reports.CreateReport(_user, body, "desktop");`);
save(core2);

const demo2 = load('Data/DemoDesktopData.Content.cs');
rep(demo2, `    public OpResult GenerateReport(string type)`,
`    public OpResult GenerateReport(string type, string? from = null, string? to = null, string? title = null)`);
save(demo2);

const repPage = load('Pages/ReportsPage.cs');
rep(repPage, `        actions.Children.Add(Kit.Btn("生成日报", () => Generate("daily"), primary: true, small: true));
        actions.Children.Add(Kit.Btn("生成周报", () => Generate("weekly"), small: true));
        actions.Children.Add(Kit.Btn("导出 CSV", Export, small: true));`,
`        actions.Children.Add(Kit.Btn("生成日报", () => Generate("daily"), primary: true, small: true));
        actions.Children.Add(Kit.Btn("生成周报", () => Generate("weekly"), small: true));
        actions.Children.Add(Kit.Btn("生成月报", () => Generate("monthly"), small: true));
        actions.Children.Add(Kit.Btn("自定义报表", GenerateCustom, small: true));
        actions.Children.Add(Kit.Btn("导出 CSV", Export, small: true));`);
rep(repPage, `    private void Export()`,
`    private void GenerateCustom()
    {
        var dlg = new FormDialog(Host, "自定义报表", "按时间范围生成，报表内容为生成时刻的快照。");
        var from = dlg.AddText("开始日期（yyyy-MM-dd）", DateTime.Today.AddDays(-6).ToString("yyyy-MM-dd"));
        var to = dlg.AddText("结束日期（yyyy-MM-dd）", DateTime.Today.ToString("yyyy-MM-dd"));
        var title = dlg.AddText("报表标题（可选）", "", "留空自动命名");
        if (!dlg.Ask("生成", validate: () =>
            {
                if (!DateTime.TryParse(from.Text, out var f)) return "开始日期格式不正确";
                if (!DateTime.TryParse(to.Text, out var t)) return "结束日期格式不正确";
                if (f > t) return "开始日期不能晚于结束日期";
                if ((t - f).TotalDays > 366) return "时间范围不能超过一年";
                return null;
            })) return;
        var result = Svc.Data.GenerateReport("custom", from.Text.Trim(), to.Text.Trim(), string.IsNullOrWhiteSpace(title.Text) ? null : title.Text.Trim());
        Toast(result.Message, result.Ok);
        RefreshData();
        Host.RefreshShell();
    }

    private void Export()`);
save(repPage);
console.log('inspection items + monthly/custom reports patched');
