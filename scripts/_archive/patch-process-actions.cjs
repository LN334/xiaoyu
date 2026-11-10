const fs = require('fs');
const p = 'D:/小禹/native/ZhifuWater.Desktop/Pages/ProcessPage.cs';
let raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let s = raw.replace(/\r\n/g, '\n');
if (s.includes('本单元告警')) { console.log('already patched'); process.exit(0); }
const anchor = `        _detail.Children.Add(head);
        _detail.Children.Add(Kit.Divider(8, 5));

        if (snap.Readings.Count == 0)`;
if (!s.includes(anchor)) { console.log('anchor missing'); process.exit(1); }
const block = `        _detail.Children.Add(head);
        _detail.Children.Add(Kit.Divider(8, 5));

        var openAlarms = Svc.Data.Alarms("open").Where(a => a.UnitCode == snap.Unit.Code).ToList();
        if (openAlarms.Count > 0)
        {
            var alarm = openAlarms[0];
            var alarmBox = new Border
            {
                Background = Pal.ToneBg(Pal.AlarmLevelTone(alarm.Level)),
                CornerRadius = new CornerRadius(3),
                Padding = new Thickness(10, 8, 10, 8),
            };
            var alarmBody = new StackPanel();
            alarmBody.Children.Add(Kit.Row(6,
                Kit.Badge(Pal.AlarmLevelText(alarm.Level), Pal.AlarmLevelTone(alarm.Level)),
                Kit.T(alarm.Title, 11.5, Pal.Ink, bold: true)));
            var detail = "当前 " + (alarm.Value?.ToString("0.##") ?? "—") +
                         (alarm.Threshold.Length > 0 ? " · 阈值 " + alarm.Threshold : "") +
                         " · 开始 " + Kit.FormatTime(alarm.At);
            alarmBody.Children.Add(Kit.T(detail, 10.5, Pal.Muted, wrap: TextWrapping.Wrap));
            alarmBody.Children.Add(Kit.T("本单元告警 " + openAlarms.Count + " 条", 10.5, Pal.Muted2));
            var alarmActions = Kit.Row(6,
                Kit.Btn("确认告警", () =>
                {
                    if (!Dlg.Confirm(Host, "确认告警", "确认「" + alarm.Title + "」？\\n确认后记录处理人与时间。", "确认")) return;
                    var r = Svc.Data.AckAlarm(alarm.Id, "工艺页确认");
                    Toast(r.Message, r.Ok);
                    if (r.Ok) RefreshData();
                }, small: true, primary: true),
                Kit.Btn("派工处理", () =>
                {
                    if (!Dlg.Confirm(Host, "派发工单", "为「" + snap.Unit.Name + "」创建一张维修工单？", "创建工单")) return;
                    var r = Svc.Data.CreateWorkOrder("处理告警：" + alarm.Title, "repair",
                        alarm.Level == "critical" ? "high" : "normal", snap.Unit.Code, null, detail);
                    Toast(r.Message, r.Ok);
                    if (r.Ok) Host.ShowPage("workorders");
                }, small: true),
                Kit.Btn("查看告警", () => Host.ShowPage("alarms"), small: true));
            alarmActions.Margin = new Thickness(0, 8, 0, 0);
            alarmBody.Children.Add(alarmActions);
            alarmBox.Child = alarmBody;
            _detail.Children.Add(alarmBox);
        }

        if (snap.Readings.Count == 0)`;
s = s.replace(anchor, block);
s = s.replace(`            Kit.Btn("去实时监测", () => Host.ShowPage("monitor"), small: true),
            Kit.Btn("去诊断", () => Host.ShowPage("diagnosis"), small: true));`,
`            Kit.Btn("去实时监测", () => Host.ShowPage("monitor"), small: true),
            Kit.Btn("去诊断", () => Host.ShowPage("diagnosis"), small: true),
            Kit.Btn("远程控制", () => Host.ShowPage("control"), small: true));`);
if (crlf) s = s.replace(/\n/g, '\r\n');
fs.writeFileSync(p, s, 'utf8');
console.log('process actions patched');
