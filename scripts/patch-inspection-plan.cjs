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

const models = load('Data/Models.cs');
rep(models, `public sealed class InspectionItemInput`, `public sealed class InspectionPlanInfo
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Cycle { get; set; } = "";
    public int ItemCount { get; set; }
    public string Desc { get; set; } = "";
}

public sealed class InspectionItemInput`);
save(models);

const api = load('Data/IDesktopData.cs');
rep(api, `    OpResult SubmitInspection(string id, string summary, IReadOnlyList<InspectionItemInput> items);`,
`    OpResult SubmitInspection(string id, string summary, IReadOnlyList<InspectionItemInput> items);
    IReadOnlyList<InspectionPlanInfo> InspectionPlans { get; }
    OpResult CreateInspection(string planId, string? assigneeId, DateTime? dueAt);`);
save(api);

const core = load('Data/CoreDesktopData.cs');
rep(core, `    public IReadOnlyList<InspectionInfo> Inspections`,
`    public IReadOnlyList<InspectionPlanInfo> InspectionPlans
    {
        get
        {
            if (_user is null) return new List<InspectionPlanInfo>();
            try
            {
                return J.Objs(_core.Ops.InspectionPlans(_user, _siteId)).Select(p => new InspectionPlanInfo
                {
                    Id = J.Str(p, "id"),
                    Name = J.Str(p, "name"),
                    Cycle = J.Str(p, "cycle"),
                    ItemCount = J.Objs(J.A(p, "items")).Count,
                    Desc = J.Str(p, "desc"),
                }).ToList();
            }
            catch (CoreException) { return new List<InspectionPlanInfo>(); }
        }
    }

    public OpResult CreateInspection(string planId, string? assigneeId, DateTime? dueAt)
    {
        try
        {
            var body = new JsonObject { ["planId"] = planId };
            if (!string.IsNullOrWhiteSpace(assigneeId)) body["assigneeId"] = assigneeId;
            if (dueAt.HasValue) body["dueAt"] = dueAt.Value.ToString("yyyy-MM-ddTHH:mm:ss");
            var task = _core.Ops.CreateInspection(_user, body, "desktop");
            Refresh();
            return OpResult.Done("巡检任务已生成：" + J.Str(task, "id"));
        }
        catch (CoreException ex) { return OpResult.Fail(ex.Message); }
    }

    public IReadOnlyList<InspectionInfo> Inspections`);
save(core);

const demo = load('Data/DemoDesktopData.Content.cs');
rep(demo, `    public IReadOnlyList<InspectionInfo> Inspections => Rt.Inspections.OrderBy(i => i.DueAt).ToList();`,
`    public IReadOnlyList<InspectionPlanInfo> InspectionPlans => new List<InspectionPlanInfo>();

    public OpResult CreateInspection(string planId, string? assigneeId, DateTime? dueAt) => GenerateInspection();

    public IReadOnlyList<InspectionInfo> Inspections => Rt.Inspections.OrderBy(i => i.DueAt).ToList();`);
save(demo);

const page = load('Pages/InspectionsPage.cs');
rep(page, `        actions.Children.Add(Kit.Btn("生成巡检任务", CreateInspection, primary: true, small: true));
        actions.Children.Add(Kit.Btn("提交巡检结果", SubmitSelected, small: true));`,
`        actions.Children.Add(Kit.Btn("按计划生成", CreateFromPlan, primary: true, small: true));
        actions.Children.Add(Kit.Btn("临时巡检", CreateInspection, small: true));
        actions.Children.Add(Kit.Btn("提交巡检结果", SubmitSelected, small: true));`);
rep(page, `    private void CreateInspection()`,
`    private void CreateFromPlan()
    {
        var plans = Svc.Data.InspectionPlans;
        if (plans.Count == 0)
        {
            Toast("当前没有可用的巡检计划，请使用「临时巡检」", false);
            return;
        }
        var people = Svc.Data.Users.Where(u => u.IsActive).ToList();
        var dlg = new FormDialog(Host, "按计划生成巡检", "从标准计划生成任务，可按需指定执行人。");
        var plan = dlg.AddCombo("巡检计划", plans.Select(p => p.Name + "（" + p.Cycle + " · " + p.ItemCount + " 项）").ToList());
        var assign = dlg.AddCombo("执行人", new[] { "默认（当前账号）" }.Concat(people.Select(u => u.User.Name)).ToList());
        if (!dlg.Ask("生成")) return;
        var target = plans[Math.Max(0, plan.SelectedIndex)];
        var assignee = assign.SelectedIndex <= 0 ? null : people[assign.SelectedIndex - 1].User.Id;
        var result = Svc.Data.CreateInspection(target.Id, assignee, DateTime.Now.AddHours(8));
        Toast(result.Message, result.Ok);
        RefreshData();
        Host.RefreshShell();
    }

    private void CreateInspection()`);
save(page);
console.log('plan-based inspection generation added');
