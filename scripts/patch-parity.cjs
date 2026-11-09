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

// 告警：规则列表 + 启停
const alarms = load('Pages/AlarmsPage.cs');
rep(alarms, `    private AlarmInfo? _selected;`,
`    private AlarmInfo? _selected;
    private DataGrid _ruleTable = null!;
    private AlarmRuleInfo? _ruleSelected;`);
rep(alarms, `        root.Children.Add(new Border { Height = 10 });
        root.Children.Add(Kit.Card("告警列表", listBody, null, null, new Thickness(10, 8, 10, 8)));

        Install(Kit.Scroll(root));`,
`        root.Children.Add(new Border { Height = 10 });
        root.Children.Add(Kit.Card("告警列表", listBody, null, null, new Thickness(10, 8, 10, 8)));

        _ruleTable = Table(new[] { "规则", "级别", "条件", "状态" }, new double[] { 0, 56, 220, 64 }, row =>
        {
            _ruleSelected = row.Data as AlarmRuleInfo;
        });
        var ruleBody = new DockPanel { LastChildFill = true };
        var ruleBar = Kit.Row(8, Kit.T("停用后规则不再触发新告警；已有告警不受影响。", 10, Pal.Muted2),
            Kit.Btn("启用 / 停用", ToggleRule, small: true));
        ruleBar.Margin = new Thickness(0, 6, 0, 6);
        DockPanel.SetDock(ruleBar, Dock.Bottom);
        ruleBody.Children.Add(ruleBar);
        ruleBody.Children.Add(_ruleTable);
        root.Children.Add(new Border { Height = 10 });
        root.Children.Add(Kit.Card("告警规则", ruleBody, null, null, new Thickness(10, 8, 10, 8)));

        Install(Kit.Scroll(root));`);
rep(alarms, `    protected override void RefreshData()
    {
        Query();
    }`,
`    protected override void RefreshData()
    {
        Query();
        _ruleTable.ItemsSource = Svc.Data.AlarmRules.Select(r => new UiRow
        {
            Texts = new[]
            {
                r.Name,
                Pal.AlarmLevelText(r.Level),
                r.Condition,
                r.Enabled ? "启用" : "停用",
            },
            Fgs = new[]
            {
                Pal.Ink2,
                Pal.ToneFg(Pal.AlarmLevelTone(r.Level)),
                Pal.Muted,
                r.Enabled ? Pal.ToneFg("good") : Pal.Muted2,
            },
            Data = r,
            Key = r.Id,
        }).ToList();
    }

    private void ToggleRule()
    {
        if (_ruleSelected == null) { Toast("请先选择规则", false); return; }
        var r = _ruleSelected;
        var result = Svc.Data.ToggleAlarmRule(r.Id);
        Toast(result.Message, result.Ok);
        RefreshData();
    }`);
save(alarms);

// 参数：写入方式与审批文案
const params = load('Pages/ParamsPage.cs');
rep(params, `        _detail.Children.Add(Kit.T($"键 {p.Key} · 分组 {p.Group} · 写入方式 {(p.WriteMode == "cloud" ? "云端下发" : "就地设置")}", 10, Pal.Muted2, wrap: TextWrapping.Wrap));`,
`        _detail.Children.Add(Kit.T($"键 {p.Key} · 分组 {p.Group} · 写入方式 {WriteModeText(p.WriteMode)}", 10, Pal.Muted2, wrap: TextWrapping.Wrap));`);
rep(params, `        var buttons = Kit.Row(6,
            Kit.Btn("编辑参数", EditSelected, primary: true, small: true),
            Kit.Btn("回滚版本", RollbackSelected, small: true));`,
`        var buttons = Kit.Row(6,
            Kit.Btn(p.WriteMode == "approval" ? "提交审批" : "编辑参数", EditSelected, primary: true, small: true),
            Kit.Btn("回滚版本", RollbackSelected, small: true));`);
rep(params, `        var p = _selected;
        var dlg = new FormDialog(Host, "编辑参数 · " + p.Name, $"{p.Desc}\\n范围 {p.Min} – {p.Max} {p.Unit}");`,
`        var p = _selected;
        var approval = p.WriteMode == "approval";
        var dlg = new FormDialog(Host, (approval ? "提交参数变更 · " : "编辑参数 · ") + p.Name,
            $"{p.Desc}\\n范围 {p.Min} – {p.Max} {p.Unit}" + (approval ? "\\n该参数需审批后生效，提交后进入审批申请。" : ""));`);
rep(params, `        if (!dlg.Ask("保存并生效", validate: () =>`,
`        if (!dlg.Ask(approval ? "提交审批" : "保存并生效", validate: () =>`);
rep(params, `    private void RollbackSelected()`,
`    private static string WriteModeText(string mode) => mode switch
    {
        "cloud" => "直接写入",
        "approval" => "审批后生效",
        "local" => "现场设定",
        _ => mode,
    };

    private void RollbackSelected()`);
save(params);
console.log('alarm rules and approval wording added');
