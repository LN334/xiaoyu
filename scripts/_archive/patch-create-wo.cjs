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
function rep(f, a, b) { if (f.s.split(a).length !== 2) throw new Error(f.rel + ' x' + (f.s.split(a).length - 1) + ': ' + a.slice(0, 60)); f.s = f.s.replace(a, b); }

const api = load('Data/IDesktopData.cs');
rep(api, `    OpResult AssignWorkOrder(string id, string userId, string note);`,
`    OpResult AssignWorkOrder(string id, string userId, string note);
    OpResult CreateWorkOrder(string title, string type, string priority, string unitCode, string? assigneeId, string description);`);
save(api);

const core = load('Data/CoreDesktopData.cs');
rep(core, `    public IReadOnlyList<InspectionInfo> Inspections`,
`    public OpResult CreateWorkOrder(string title, string type, string priority, string unitCode, string? assigneeId, string description)
    {
        try
        {
            _core.Ops.CreateWorkorder(_user, new JsonObject
            {
                ["siteId"] = _siteId,
                ["title"] = title,
                ["type"] = type,
                ["priority"] = priority,
                ["unitCode"] = unitCode,
                ["assigneeId"] = assigneeId,
                ["description"] = description,
            }, "desktop");
            Refresh();
            return OpResult.Done("工单已创建");
        }
        catch (CoreException ex) { return OpResult.Fail(ex.Message); }
    }

    public IReadOnlyList<InspectionInfo> Inspections`);
save(core);

const demo = load('Data/DemoDesktopData.Content.cs');
rep(demo, `    public IReadOnlyList<InspectionInfo> Inspections => Rt.Inspections.OrderBy(i => i.DueAt).ToList();`,
`    public OpResult CreateWorkOrder(string title, string type, string priority, string unitCode, string? assigneeId, string description)
    {
        if (_user?.Can("workorder.handle") != true) return OpResult.Fail("当前账号无工单权限");
        if (string.IsNullOrWhiteSpace(title)) return OpResult.Fail("请填写工单标题");
        var unit = DemoCatalog.Units().FirstOrDefault(u => u.Code == unitCode);
        var person = string.IsNullOrEmpty(assigneeId) ? null : Users.FirstOrDefault(u => u.User.Id == assigneeId)?.User;
        var now = DateTime.Now;
        var wo = new WorkOrderInfo
        {
            Id = "WO-" + now.ToString("yyyyMMdd-HHmmss"),
            SiteId = Rt.Info.Id,
            Title = title.Trim(),
            Type = type,
            Priority = priority,
            Status = person is null ? "pending" : "accepted",
            UnitCode = unitCode,
            UnitName = unit?.Name ?? unitCode,
            Assignee = person?.Name ?? "",
            Creator = _user.Name,
            Source = "manual",
            CreatedAt = Ms(now),
            DueAt = Ms(now.AddHours(24)),
            Desc = description,
        };
        wo.Timeline.Add(new TimelineEntry { At = Ms(now), Actor = _user.Name, Text = person is null ? "创建工单" : "创建工单并派发给 " + person.Name });
        Rt.WorkOrders.Insert(0, wo);
        RecordAudit("workorder.create", "workorder", wo.Id, wo.Title);
        Touch();
        return OpResult.Done("工单已创建");
    }

    public IReadOnlyList<InspectionInfo> Inspections => Rt.Inspections.OrderBy(i => i.DueAt).ToList();`);
save(demo);

const page = load('Pages/WorkordersPage.cs');
rep(page, `        var tableCard = Kit.Card("工单列表", tableHost, null, null, new Thickness(10, 8, 10, 8));`,
`        var tableCard = Kit.Card("工单列表", tableHost,
            Kit.Btn("新建工单", CreateOrder, primary: true, small: true), null, new Thickness(10, 8, 10, 8));`);
rep(page, `    private void Assign(WorkOrderInfo wo)`,
`    private void CreateOrder()
    {
        var types = new[] { ("repair", "维修"), ("maintain", "保养"), ("calibrate", "校准"), ("inspect", "巡检异常") };
        var prios = new[] { ("normal", "普通"), ("high", "高"), ("urgent", "紧急"), ("low", "低") };
        var units = Svc.Data.Units.ToList();
        var people = Svc.Data.Users.Where(u => u.IsActive).ToList();
        var dlg = new FormDialog(Host, "新建工单", "创建后为待接单；指定负责人则直接进入已接单。");
        var title = dlg.AddText("标题", "", "例如：提升泵异响排查");
        var type = dlg.AddCombo("类型", types.Select(t => t.Item2).ToList());
        var prio = dlg.AddCombo("优先级", prios.Select(p => p.Item2).ToList());
        var unit = dlg.AddCombo("单元", units.Select(u => u.Name).ToList());
        var assign = dlg.AddCombo("负责人", new[] { "暂不指派" }.Concat(people.Select(u => u.User.Name + (string.IsNullOrWhiteSpace(u.User.Title) ? "" : " · " + u.User.Title))).ToList());
        var desc = dlg.AddText("说明（可选）");
        if (!dlg.Ask("创建", validate: () =>
            {
                if (string.IsNullOrWhiteSpace(title.Text)) return "请填写工单标题";
                if (title.Text.Trim().Length < 4) return "标题至少 4 个字";
                return null;
            })) return;
        var unitRow = units[Math.Max(0, unit.SelectedIndex)];
        var assignee = assign.SelectedIndex <= 0 ? null : people[assign.SelectedIndex - 1].User.Id;
        var r = Svc.Data.CreateWorkOrder(
            title.Text.Trim(),
            types[Math.Max(0, type.SelectedIndex)].Item1,
            prios[Math.Max(0, prio.SelectedIndex)].Item1,
            unitRow.Code,
            assignee,
            desc.Text.Trim());
        Toast(r.Message, r.Ok);
        RefreshData();
        Host.RefreshShell();
    }

    private void Assign(WorkOrderInfo wo)`);
save(page);
console.log('create work order added');
