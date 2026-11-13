using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;

namespace ZhifuWater.Desktop.Data;

// 演示引擎的数据装配与业务查询（DemoDesktopData 的 partial 部分）
public sealed partial class DemoDesktopData
{
    // ============================ 装配 ============================
    private void BuildPoints(SiteRuntime rt)
    {
        var rnd = new Random(rt.Info.Id == "site-1" ? 20261026 : 20261027);
        foreach (var seed in DemoCatalog.Points())
        {
            var installed = !(seed.Optional && rt.Info.Id == "site-2");
            var def = new PointDef
            {
                Id = rt.Info.Id + "-" + seed.Code.ToLowerInvariant().Replace('.', '_'),
                Code = seed.Code,
                Name = seed.Name,
                UnitCode = seed.UnitCode,
                Unit = seed.Unit,
                Type = seed.Type,
                Range = seed.Range,
                Accuracy = seed.Type == "measure" ? "±1% FS" : "",
                IntervalSec = seed.Interval,
                Writable = installed ? seed.Writable : "read",
                Provenance = seed.Provenance,
                Desc = seed.Desc,
                Digits = seed.Digits,
            };
            var p = new PointRuntime
            {
                Def = def,
                Installed = installed,
                Base = seed.Base,
                Min = seed.Min,
                Max = seed.Max,
                Wave = seed.Wave,
                Quality = installed ? "good" : "notinstalled",
                T = Ms(DateTime.Now),
            };
            p.Value = installed
                ? Math.Round(Math.Clamp(seed.Base + (rnd.NextDouble() - 0.5) * seed.Wave * 0.6, seed.Min, seed.Max), seed.Digits)
                : null;
            if (seed.Type == "run") p.Value = 1;
            if (seed.Type == "alarm") p.Value = 0;
            if (seed.Type == "state") p.Value = 0;
            rt.Points[seed.Code] = p;
        }
        rt.BafBw.Count = 36;
        rt.SulfurBw.Count = 24;
    }

    private void BuildAlarms(SiteRuntime rt)
    {
        var now = DateTime.Now;
        var isPrimary = rt.Info.Id == "site-1";
        string Id(int n) => "AL-" + now.ToString("yyyyMMdd") + "-" + (isPrimary ? "" : "B") + n.ToString("000");

        void A(string title, string level, string status, string unit, string detail, double? value, string threshold,
            string rule, string device, DateTime at, DateTime? ack = null, DateTime? resolved = null, string note = "")
        {
            var unitName = DemoCatalog.Units().FirstOrDefault(u => u.Code == unit)?.Name ?? "公共系统";
            var alarm = new AlarmInfo
            {
                Id = Id(rt.Alarms.Count + 1),
                SiteId = rt.Info.Id,
                Level = level,
                Title = title,
                Detail = detail,
                Status = status,
                UnitCode = unit,
                UnitName = unitName,
                DeviceName = device,
                RuleName = rule,
                Value = value,
                Threshold = threshold,
                At = Ms(at),
                AckAt = ack == null ? null : Ms(ack.Value),
                ResolvedAt = resolved == null ? null : Ms(resolved.Value),
                AckBy = ack == null ? "" : (isPrimary ? "赵磊" : "孙倩"),
                Note = note,
            };
            alarm.Timeline.Add(new TimelineEntry { At = alarm.At, Actor = "规则引擎", Text = $"触发规则「{rule}」：{detail}" });
            if (alarm.AckAt != null) alarm.Timeline.Add(new TimelineEntry { At = alarm.AckAt.Value, Actor = alarm.AckBy, Text = "确认告警" });
            if (alarm.ResolvedAt != null) alarm.Timeline.Add(new TimelineEntry { At = alarm.ResolvedAt.Value, Actor = "系统", Text = "现场恢复正常，告警自动恢复" });
            rt.Alarms.Add(alarm);
        }

        if (isPrimary)
        {
            A("自养脱氮出水 pH 偏低", "major", "active", "sulfur", "pH 6.76 低于下限 6.80，反硝化效率存在下降风险",
                6.76, "pH ≥ 6.80", "自养脱氮出水 pH 低于下限", "pH-501", now.AddHours(-2).AddMinutes(-10));
            A("预氧化溶解氧不足", "major", "active", "baf", "DO 1.78 mg/L 低于控制下限 2.00 mg/L，硝化受抑制",
                1.78, "DO ≥ 2.00 mg/L", "预氧化溶解氧不足", "DO-201", now.AddHours(-1).AddMinutes(-35));
            A("进水调节池液位偏低", "major", "acknowledged", "raw", "液位 22.6% 低于 25%，已确认并安排补水",
                22.6, "液位 ≥ 25%", "进水调节池液位偏低", "LT-101", now.AddHours(-3).AddMinutes(-5),
                now.AddHours(-2).AddMinutes(-48), null, "已联系村委补水，预计 40 分钟内恢复");
            A("PAC 药箱余量低", "minor", "active", "pac", "余量 18.4%，低于 20% 提醒线", 18.4, "余量 ≥ 20%",
                "PAC 药箱余量低", "P-301", now.AddHours(-4).AddMinutes(-20));
            A("自养脱氮反冲洗压力偏高", "minor", "resolved", "sulfur", "反冲洗峰值压力 0.63 MPa，超过 0.60 MPa",
                0.63, "压力 ≤ 0.60 MPa", "反冲洗压力偏高", "P-501", now.AddHours(-6).AddMinutes(-12),
                now.AddHours(-6).AddMinutes(-5), now.AddHours(-5).AddMinutes(-40));
            A("自养脱氮滤层压差偏高", "minor", "resolved", "sulfur", "压差 26.8 kPa，接近反冲洗触发值",
                26.8, "压差 ≤ 25 kPa", "自养脱氮滤层压差偏高", "DP-501", now.AddHours(-8).AddMinutes(-30),
                now.AddHours(-8).AddMinutes(-10), now.AddHours(-7).AddMinutes(-30));
            A("清水池液位偏高", "info", "active", "clear", "液位 91%，回用量下降", 91, "液位 ≤ 90%",
                "清水池液位偏高", "LT-601", now.AddMinutes(-42));
            A("曝气风机故障", "critical", "closed", "baf", "风机过载保护动作，控制柜跳闸",
                null, "运行反馈正常", "曝气风机故障", "B-201", now.AddDays(-1).AddHours(-3),
                now.AddDays(-1).AddHours(-3).AddMinutes(8), now.AddDays(-1).AddHours(-1), "更换热继电器后恢复");
            A("预氧化溶解氧短时低", "info", "closed", "baf", "检修期间 DO 短时降至 1.92 mg/L",
                1.92, "DO ≥ 2.00 mg/L", "预氧化溶解氧不足", "DO-201", now.AddDays(-1).AddHours(-2),
                null, now.AddDays(-1).AddHours(-1).AddMinutes(40));
            A("边缘网关心跳丢失", "critical", "closed", "plant", "网关离线 4 分 12 秒，数据中断",
                null, "心跳间隔 ≤ 90 s", "边缘网关离线", "GW-1", now.AddDays(-2).AddHours(-5),
                now.AddDays(-2).AddHours(-5).AddMinutes(2), now.AddDays(-2).AddHours(-4).AddMinutes(50));
        }
        else
        {
            A("进水调节池液位偏低", "major", "acknowledged", "raw", "液位 24.1%，已通知现场补水",
                24.1, "液位 ≥ 25%", "进水调节池液位偏低", "LT-101", now.AddHours(-2).AddMinutes(-20),
                now.AddHours(-1).AddMinutes(-50), null, "复制试点，补水依赖人工");
            A("PAC 药箱余量低", "minor", "active", "pac", "余量 19.2%，低于 20% 提醒线",
                19.2, "余量 ≥ 20%", "PAC 药箱余量低", "P-301", now.AddHours(-3).AddMinutes(-10));
            A("进水流量计通信中断", "minor", "closed", "dist1", "选配流量计未安装，通信超时",
                null, "通信正常", "流量计通信中断", "FT-101", now.AddDays(-3),
                now.AddDays(-3).AddMinutes(20), now.AddDays(-3).AddHours(1), "确认为选配点位未安装，已关闭规则");
        }
    }

    private void BuildWorkOrders(SiteRuntime rt)
    {
        var now = DateTime.Now;
        var isPrimary = rt.Info.Id == "site-1";
        void W(int n, string title, string type, string priority, string status, string unit, string device,
            string assignee, string source, DateTime created, DateTime? due, DateTime? done, string desc, string result = "")
        {
            var unitName = DemoCatalog.Units().FirstOrDefault(u => u.Code == unit)?.Name ?? "公共系统";
            var wo = new WorkOrderInfo
            {
                Id = "WO-" + now.ToString("yyyyMMdd") + "-" + n.ToString("000"),
                SiteId = rt.Info.Id,
                Title = title,
                Type = type,
                Priority = priority,
                Status = status,
                UnitCode = unit,
                UnitName = unitName,
                DeviceName = device,
                Assignee = assignee,
                Creator = isPrimary ? "王敏" : "孙倩",
                Source = source,
                CreatedAt = Ms(created),
                DueAt = due == null ? null : Ms(due.Value),
                DoneAt = done == null ? null : Ms(done.Value),
                Desc = desc,
                Result = result,
            };
            wo.Timeline.Add(new TimelineEntry { At = wo.CreatedAt, Actor = wo.Creator, Text = "创建工单" });
            if (status != "pending") wo.Timeline.Add(new TimelineEntry { At = wo.CreatedAt + 3600000, Actor = assignee, Text = "接单" });
            if (status is "done" or "closed") wo.Timeline.Add(new TimelineEntry { At = (wo.DoneAt ?? wo.CreatedAt) - 1800000, Actor = assignee, Text = "处理完成并提交结果" });
            rt.WorkOrders.Add(wo);
        }

        if (isPrimary)
        {
            W(1, "自养脱氮 pH 探头校准与碱度核查", "repair", "high", "processing", "sulfur", "pH-501",
                "陈浩", "告警 AL-" + now.ToString("yyyyMMdd") + "-001", now.AddHours(-2), now.AddHours(4), null,
                "复核 pH 探头标液，取样复测进水碱度，必要时投加碳酸氢钠。");
            W(2, "预氧化曝气风机电流偏高排查", "maintain", "normal", "pending", "baf", "B-201",
                "赵磊", "告警联动", now.AddHours(-1), now.AddHours(6), null,
                "检查风机进气滤网、止回阀与皮带松紧，测量三相电流平衡度。");
            W(3, "进水调节池液位计零点校准", "calibrate", "normal", "accepted", "raw", "LT-101",
                "陈浩", "定期校准", now.AddDays(-1), now.AddHours(20), null,
                "排空后置零点，满量程两点校验，记录校准证书编号。");
            W(4, "PAC 加药泵密封更换", "repair", "normal", "done", "pac", "P-301",
                "陈浩", "巡检发现", now.AddDays(-2), now.AddDays(-1), now.AddDays(-1).AddHours(2),
                "泵头渗漏，更换隔膜与密封圈。", "更换后保压 30 min 无渗漏，投加量恢复正常。");
            W(5, "现场控制柜清灰与接线紧固", "maintain", "low", "done", "plant", "PLC-1",
                "赵磊", "月度计划", now.AddDays(-4), now.AddDays(-3), now.AddDays(-3).AddHours(1),
                "断电清灰，紧固端子，检查接地电阻。", "接地电阻 2.1 Ω，符合要求。");
            W(6, "序批预氧化池浮渣清理", "maintain", "normal", "pending", "primary", "序批预氧化池",
                "赵磊", "巡检发现", now.AddDays(-1), now.AddHours(30), null,
                "浮渣厚度约 3 cm，安排人工清理并检查刮渣板。");
        }
        else
        {
            W(1, "进水调节池补水与液位计核对", "repair", "high", "processing", "raw", "LT-101",
                "孙倩", "告警联动", now.AddHours(-2), now.AddHours(3), null, "人工补水至 70%，核对液位计读数。");
            W(2, "PAC 药剂补货", "maintain", "normal", "pending", "pac", "P-301",
                "孙倩", "耗材预警", now.AddHours(-3), now.AddHours(8), null, "补 25 L PAC 原液并记录批次。");
            W(3, "复制试点仪表巡检", "maintain", "normal", "done", "plant", "PLC-1",
                "孙倩", "周巡检", now.AddDays(-2), now.AddDays(-1), now.AddDays(-1).AddHours(3),
                "检查选配点位接线与标识。", "确认未装点位已挂牌，无异常。");
        }
    }

    private void BuildLabs(SiteRuntime rt)
    {
        var rnd = new Random(rt.Info.Id == "site-1" ? 7 : 11);
        var bases = new Dictionary<string, Dictionary<string, double>>
        {
            ["inlet"] = new() { ["COD"] = 168, ["NH3N"] = 32.5, ["TN"] = 38.4, ["TP"] = 4.2, ["SS"] = 120, ["TURB"] = 96, ["pH"] = 7.10 },
            ["baf"] = new() { ["COD"] = 42, ["NH3N"] = 2.8, ["TN"] = 14.6, ["TP"] = 1.9, ["SS"] = 26, ["TURB"] = 18, ["pH"] = 7.05 },
            ["outlet"] = new() { ["COD"] = 18.6, ["NH3N"] = 0.42, ["TN"] = 8.4, ["TP"] = 0.28, ["SS"] = 6, ["TURB"] = 3.2, ["pH"] = 7.12 },
        };
        var points = DemoCatalog.LabPoints();
        var dayOffset = 0;
        foreach (var point in points)
        {
            for (var d = 2; d >= 0; d--)
            {
                var at = DateTime.Today.AddDays(-d).AddHours(9).AddMinutes(10 + dayOffset * 5);
                var rec = new LabRecord
                {
                    Id = "LAB-" + at.ToString("yyyyMMdd") + "-" + (point == "inlet" ? "I" : point == "baf" ? "B" : "O"),
                    SiteId = rt.Info.Id,
                    SamplePoint = point,
                    SamplePointName = DemoCatalog.LabPointName(point),
                    SampledAt = Ms(at),
                    Status = d == 0 && point != "inlet" ? "pending_review" : "reviewed",
                    Recorder = d == 0 ? "孙倩" : "李工",
                    Reviewer = d == 0 ? "" : "李工",
                    Remark = d == 0 ? "当日复检，待复核" : "",
                };
                foreach (var def in DemoCatalog.LabMetrics())
                {
                    var baseValue = bases[point][def.Key];
                    var variation = 1 + (rnd.NextDouble() - 0.5) * 0.08;
                    rec.Metrics[def.Key] = Math.Round(baseValue * variation, def.Digits);
                }
                rt.Labs.Add(rec);
            }
            dayOffset++;
        }
        rt.Labs = rt.Labs.OrderByDescending(l => l.SampledAt).ToList();
    }

    private void BuildParams(SiteRuntime rt)
    {
        rt.Params = DemoCatalog.Params(rt.Info.Id, DateTime.Now);
        var param = rt.Params.FirstOrDefault(p => p.Key == "PAC_DOSE");
        if (param != null)
        {
            param.Version = 3;
            param.Current = 1.8;
            param.UpdatedAt = DateTime.Now.AddDays(-1).ToString("yyyy-MM-dd HH:mm");
            param.UpdatedBy = "李工";
            param.Versions.Add(new ParamVersion { Version = 1, Value = 2.2, At = DateTime.Now.AddDays(-6).ToString("yyyy-MM-dd HH:mm"), By = "李工", Reason = "初始整定" });
            param.Versions.Add(new ParamVersion { Version = 2, Value = 2.0, At = DateTime.Now.AddDays(-4).ToString("yyyy-MM-dd HH:mm"), By = "王敏", Reason = "浊度下降，下调 0.2" });
            param.Versions.Add(new ParamVersion { Version = 3, Value = 1.8, At = DateTime.Now.AddDays(-1).ToString("yyyy-MM-dd HH:mm"), By = "李工", Reason = "优化药耗" });
        }
        if (rt.Info.Id == "site-1")
        {
            rt.Requests.Add(new ParamRequest
            {
                Id = "PR-" + DateTime.Now.AddDays(-1).ToString("yyyyMMdd") + "-01",
                ParamId = rt.Params.First(p => p.Key == "SULFUR_HRT").Id,
                ParamName = "自养脱氮停留时间", Value = 100, Unit = "min",
                Reason = "进水总氮升高，延长停留时间保障脱氮", Applicant = "李工",
                At = Ms(DateTime.Now.AddDays(-1).AddHours(-2)), Status = "pending",
            });
            rt.Requests.Add(new ParamRequest
            {
                Id = "PR-" + DateTime.Now.ToString("yyyyMMdd") + "-02",
                ParamId = rt.Params.First(p => p.Key == "DO_LOW").Id,
                ParamName = "DO 下限报警", Value = 2.2, Unit = "mg/L",
                Reason = "近期硝化波动，提高报警门限提前介入", Applicant = "王敏",
                At = Ms(DateTime.Now.AddHours(-3)), Status = "pending",
            });
        }
    }

    private void BuildDevices(SiteRuntime rt)
    {
        rt.Devices = DemoCatalog.Devices(rt.Info.Id, DateTime.Now);
        var rnd = new Random(rt.Info.Id == "site-1" ? 3 : 5);
        foreach (var d in rt.Devices)
        {
            d.Online = true;
            d.RuntimeHours = Math.Round(800 + rnd.NextDouble() * 1400, 1);
            d.Starts = (int)(d.RuntimeHours / 3.2);
            d.Status = "正常";
            if (rt.Info.Id == "site-2" && d.Code == "FT-101")
            {
                d.Online = false;
                d.Status = "未安装";
            }
            var openAlarms = rt.Alarms.Count(a => a.UnitCode == d.UnitCode && IsOpen(a));
            d.Health = Math.Max(45, 100 - openAlarms * 12 - (int)(d.RuntimeHours / 400));
            if (d.Code == "P-101" && rt.Info.Id == "site-1") d.Health = 92;
            if (d.Code == "pH-501") d.Health = 78;
            if (d.Code == "B-201" && rt.Info.Id == "site-1") d.Health = 74;
        }
    }

    private void BuildInspections(SiteRuntime rt)
    {
        var now = DateTime.Now;
        void I(int n, string plan, string status, string assignee, DateTime due, DateTime? done, int abnormal, string summary,
            params (string Key, string Name, string Result, string Note)[] items)
        {
            var ins = new InspectionInfo
            {
                Id = "INS-" + due.ToString("yyyyMMdd") + "-" + n.ToString("00"),
                SiteId = rt.Info.Id, Plan = plan, Status = status, Assignee = assignee,
                DueAt = Ms(due), DoneAt = done == null ? null : Ms(done.Value),
                Abnormal = abnormal, Summary = summary,
            };
            foreach (var item in items)
                ins.Items.Add(new InspectionItem { Key = item.Key, Name = item.Name, Result = item.Result, Note = item.Note });
            rt.Inspections.Add(ins);
        }
        var defaults = new (string, string)[]
        {
            ("pump", "提升泵运行与渗漏"), ("blower", "曝气风机运行与电流"), ("valve", "阀门开度与气密"),
            ("instrument", "在线仪表读数与清洗"), ("plc", "控制柜指示与接线"), ("dosage", "药箱液位与投加量"),
            ("bw", "反冲洗系统状态"), ("env", "现场卫生与安全标识"),
        };
        I(1, "日常巡检（每日）", "pending", "赵磊", now.Date.AddHours(17), null, 0, "",
            defaults.Select(x => (x.Item1, x.Item2, "ok", "")).ToArray());
        I(2, "周检（每周一）", "done", "陈浩", now.Date.AddDays(-1).AddHours(16), now.Date.AddDays(-1).AddHours(15), 1,
            "发现 PAC 药箱余量偏低，已补药；其余正常。",
            defaults.Select(x => (x.Item1, x.Item2, x.Item1 == "dosage" ? "abnormal" : "ok", x.Item1 == "dosage" ? "药箱余量 18%" : "")).ToArray());
        I(3, "反冲洗专项检查", "done", "陈浩", now.Date.AddDays(-3).AddHours(11), now.Date.AddDays(-3).AddHours(10).AddMinutes(30), 0,
            "固液分离 / 自养脱氮反冲洗时序正常，阀门动作到位。",
            defaults.Select(x => (x.Item1, x.Item2, "ok", "")).ToArray());
        I(4, "月度维护（10 月）", "pending", "陈浩", now.Date.AddDays(4).AddHours(14), null, 0, "",
            defaults.Select(x => (x.Item1, x.Item2, "ok", "")).ToArray());
    }

    private void BuildDiagnoses(SiteRuntime rt)
    {
        var now = DateTime.Now;
        var diagnoses = new List<DiagnosisInfo>
        {
            new()
            {
                Id = "DG-01", Level = "warning", Title = "自养脱氮出水 pH 偏低，反硝化效率承压",
                Phenomenon = "SULFUR.PH 连续 30 分钟位于 6.8 以下（当前 6.9 附近波动），与 6.8–7.6 的控制区间下限贴合；同步观察到总氮去除率较上周下降约 4 个百分点。",
                Causes = new()
                {
                    "进水氨氮负荷升高，硝化消耗碱度后反硝化段 pH 缓冲不足",
                    "硫磺填料局部板结，传质效率下降",
                    "pH 计未按 30 天周期校准，存在测量偏差",
                },
                Checks = new()
                {
                    "取样复测进水氨氮与碱度，核对在线 pH 与实验室 pH 偏差",
                    "检查自养脱氮池反冲洗记录，确认压差是否持续上升",
                    "用 4.00 / 6.86 / 9.18 三点标液校准 pH-501",
                },
                Basis = "依据：DB33/T 治理设施运行规范（pH 控制 6.8–7.6）；本机规则 SULFUR_PH_LOW；近 24h 趋势与实验记录 LAB-20261026-O。",
                Suggestion = "先校表再补碱：若复测确认偏低，按 50 mg/L 投加碳酸氢钠，2 小时后复测；若压差 > 25 kPa 先执行一次反冲洗。",
                UnitName = "自养脱氮池",
                At = Ms(now.AddMinutes(-35)),
            },
            new()
            {
                Id = "DG-02", Level = "warning", Title = "预氧化溶解氧不足，硝化速率受限",
                Phenomenon = "BAF.DO 由 3.2 mg/L 降至 1.78 mg/L，低于 2.0 mg/L 控制下限；曝气风机电流 3.4 A 处于正常区间，判断为供气量不足而非风机故障。",
                Causes = new()
                {
                    "曝气头局部堵塞，氧转移效率下降",
                    "进水有机负荷升高，耗氧量增大",
                    "风机进气滤网积尘导致风量衰减",
                },
                Checks = new()
                {
                    "检查进气滤网压差并清理",
                    "逐组测试曝气均匀性，观察池面翻腾",
                    "核对进水 COD 与氨氮化验值",
                },
                Basis = "依据：本机规则 固液分离_DO_LOW；近 24h DO 趋势；曝气风机电流记录。",
                Suggestion = "先清理进气滤网并小幅上调曝气量，30 分钟后复测 DO；若仍低于 2.0 mg/L，安排曝气头检修工单。",
                UnitName = "固液分离池",
                At = Ms(now.AddHours(-1).AddMinutes(-20)),
            },
            new()
            {
                Id = "DG-03", Level = "attention", Title = "进水调节池液位偏低，存在抽空风险",
                Phenomenon = "RAW.LVL 22.6%，低于 25% 低液位线；提升泵仍运行，液位下降速率约 2%/h。",
                Causes = new()
                {
                    "进水量低于处理量，补水滞后",
                    "液位计零点漂移",
                    "提升泵流量偏大",
                },
                Checks = new()
                {
                    "现场核对液位标尺与仪表读数",
                    "联系村委确认补水时间",
                    "检查泵出口阀门开度",
                },
                Basis = "依据：本机规则 RAW_LVL_LOW；液位 10 秒采样记录。",
                Suggestion = "立即安排补水；液位低于 20% 前停泵保护，恢复至 60% 后再启泵。",
                UnitName = "进水调节池",
                At = Ms(now.AddHours(-2).AddMinutes(-5)),
            },
            new()
            {
                Id = "DG-04", Level = "ok", Title = "出水水质稳定达标",
                Phenomenon = "近 3 日实验室出水 COD 18.6–19.2 mg/L、氨氮 0.38–0.48 mg/L，均优于一级 A 标准；在线 pH 7.0–7.3，无异常波动。",
                Causes = new() { "生化系统运行稳定，污泥负荷处于设计区间" },
                Checks = new() { "保持现有回流与曝气参数", "按周检计划清洗在线仪表" },
                Basis = "依据：GB 18918-2002 一级 A；实验室记录 LAB-20261026-O / LAB-20261025-O。",
                Suggestion = "维持当前运行参数，继续每日化验跟踪。",
                UnitName = "清水池出水",
                At = Ms(now.AddHours(-6)),
            },
        };
        if (rt.Info.Id == "site-2")
        {
            diagnoses.RemoveAll(d => d.Id == "DG-02");
            diagnoses[0].Phenomenon = "复制试点进水氨氮波动较大，pH 在 6.9–7.2 之间；选配点位未装，部分结论依赖人工化验。";
            diagnoses[0].Basis += "（义乌站为复制试点，数据完整度较低）";
        }
        rt.Diagnoses = diagnoses;
    }

    private void BuildInitialCommands(SiteRuntime rt)
    {
        var now = DateTime.Now;
        rt.Commands.Add(new CommandRecord
        {
            Id = "CMD-" + now.AddDays(-1).ToString("yyyyMMdd") + "-153012",
            SiteId = rt.Info.Id, Action = "baf.backwash", Label = "固液分离反冲", Device = "P-202 / V-203",
            UnitCode = "baf", Status = "success", Reason = "压差达到 26.8 kPa，触发反冲洗",
            By = "赵磊", At = Ms(now.AddDays(-1).AddHours(-6)),
        });
        rt.Commands.Add(new CommandRecord
        {
            Id = "CMD-" + now.AddDays(-1).ToString("yyyyMMdd") + "-090511",
            SiteId = rt.Info.Id, Action = "raw.pump.start", Label = "提升泵启动", Device = "P-101 提升泵",
            UnitCode = "raw", Status = "success", Reason = "液位恢复至 65%，恢复进水",
            By = "孙倩", At = Ms(now.AddDays(-1).AddHours(-9)),
        });
        rt.Commands.Add(new CommandRecord
        {
            Id = "CMD-" + now.AddDays(-2).ToString("yyyyMMdd") + "-201144",
            SiteId = rt.Info.Id, Action = "baf.blower.stop", Label = "曝气风机停止", Device = "B-201 曝气风机",
            UnitCode = "baf", Status = "failed", Reason = "检修前停风机",
            By = "陈浩", At = Ms(now.AddDays(-2).AddHours(-3)), FailReason = "PLC 返回联锁拒绝：反冲洗进行中",
        });
    }

    private void BuildNotifications()
    {
        var now = DateTime.Now;
        _notifications.Add(new NotificationInfo { Id = "N-1", Title = "新告警：自养脱氮出水 pH 偏低", Body = "pH 6.76 低于 6.80，请及时确认。", At = Ms(now.AddMinutes(-35)), Read = false, Kind = "alarm" });
        _notifications.Add(new NotificationInfo { Id = "N-2", Title = "工单待接单", Body = "「预氧化曝气风机电流偏高排查」已派发给赵磊。", At = Ms(now.AddMinutes(-55)), Read = false, Kind = "workorder" });
        _notifications.Add(new NotificationInfo { Id = "N-3", Title = "参数变更待审批", Body = "李工提交「自养脱氮停留时间」100 min 变更申请。", At = Ms(now.AddHours(-2)), Read = false, Kind = "param" });
        _notifications.Add(new NotificationInfo { Id = "N-4", Title = "运行日报已生成", Body = now.ToString("yyyy-MM-dd") + " 运行日报已生成，可在报表中心导出。", At = Ms(now.Date.AddHours(8).AddMinutes(5)), Read = false, Kind = "report" });
        _notifications.Add(new NotificationInfo { Id = "N-5", Title = "备份完成", Body = "每日自动备份完成，保留 30 份。", At = Ms(now.Date.AddHours(2).AddMinutes(3)), Read = true, Kind = "system" });
    }

    private void BuildAudit()
    {
        var now = DateTime.Now;
        void A(int n, DateTime at, string actor, string action, string targetType, string targetId, string detail, string result = "success")
        {
            _audit.Add(new AuditInfo
            {
                Id = "AUD-" + at.ToString("yyyyMMddHHmmss") + "-" + n, At = Ms(at), Actor = actor,
                Action = action, TargetType = targetType, TargetId = targetId, Detail = detail,
                Result = result, Ip = "192.168.1.20",
            });
        }
        A(1, now.AddMinutes(-8), "赵磊", "alarm.ack", "alarm", "AL-" + now.ToString("yyyyMMdd") + "-003", "确认进水调节池液位偏低告警");
        A(2, now.AddMinutes(-42), "系统", "alarm.raise", "alarm", "AL-" + now.ToString("yyyyMMdd") + "-007", "规则「清水池液位偏高」触发");
        A(3, now.AddHours(-1), "陈浩", "control.execute", "command", "CMD-" + now.AddDays(-1).ToString("yyyyMMdd") + "-153012", "固液分离反冲");
        A(4, now.AddHours(-2), "李工", "param.request", "param", "site-1-sulfur_hrt", "自养脱氮停留时间 → 100 min");
        A(5, now.AddHours(-3), "王敏", "report.export", "report", "RPT-" + now.AddDays(-1).ToString("yyyyMMdd") + "-D1", "导出运行日报 CSV");
        A(6, now.AddHours(-4), "admin", "admin.user.add", "user", "U-chen", "新增维修工程师账号");
        A(7, now.AddHours(-5), "admin", "admin.config.save", "setting", "alarm.push", "开启告警推送");
        A(8, now.AddHours(-6), "赵磊", "workorder.accept", "workorder", "WO-" + now.ToString("yyyyMMdd") + "-003", "接单：进水调节池液位计零点校准");
        A(9, now.AddHours(-8), "系统", "backup.create", "backup", "BK-" + now.ToString("yyyyMMdd") + "-02", "每日自动备份", "success");
        A(10, now.AddDays(-1).AddHours(-2), "admin", "admin.login", "user", "U-admin", "登录成功");
        A(11, now.AddDays(-1).AddHours(-3), "王敏", "param.apply", "param", "site-1-pac_dose", "PAC 投加量 2.0 → 1.8 L/h");
        A(12, now.AddDays(-1).AddHours(-5), "孙倩", "auth.login", "user", "U-sun", "登录成功");
        A(13, now.AddDays(-2), "系统", "alarm.auto_resolve", "alarm", "AL-" + now.AddDays(-2).ToString("yyyyMMdd") + "-010", "网关心跳恢复，告警自动恢复");
        A(14, now.AddDays(-2), "陈浩", "inspection.submit", "inspection", "INS-" + now.AddDays(-3).ToString("yyyyMMdd") + "-03", "提交反冲洗专项检查");
        A(15, now.AddDays(-3), "guest", "auth.login", "user", "U-guest", "监管访客登录", "success");
    }

    private void BuildBackups()
    {
        var now = DateTime.Now;
        for (var i = 0; i < 5; i++)
        {
            var at = now.Date.AddDays(-i).AddHours(2).AddMinutes(3);
            _backups.Add(new BackupInfo
            {
                Id = "BK-" + at.ToString("yyyyMMdd") + "-" + (i == 0 ? "02" : "01"),
                At = Ms(at), Size = (2.4 + i * 0.1).ToString("F1") + " MB",
                By = i == 2 ? "admin（手动）" : "系统自动", IsAuto = i != 2,
                Note = i == 2 ? "参数整定前手动备份" : "每日自动备份",
            });
        }
    }

    // ============================ 规则评估 ============================
    private void EvaluateAlarms(SiteRuntime rt)
    {
        void Check(string code, string rule, string title, string level, Func<double, bool> violated, string threshold, string unit)
        {
            if (!rt.Points.TryGetValue(code, out var p) || p.Value == null) return;
            if (!violated(p.Value.Value)) return;
            var existing = rt.Alarms.Any(a => a.RuleName == rule && IsOpen(a) && a.At > Ms(DateTime.Now.AddMinutes(-30)));
            if (existing) return;
            var unitName = DemoCatalog.Units().FirstOrDefault(u => u.Code == unit)?.Name ?? "公共系统";
            var alarm = new AlarmInfo
            {
                Id = "AL-" + DateTime.Now.ToString("yyyyMMdd") + "-" + (++_alarmSeq).ToString("000"),
                SiteId = rt.Info.Id, Level = level, Title = title, Status = "active",
                Detail = $"{p.Def.Name} 当前 {p.Value:F2}{p.Def.Unit}，越过阈值 {threshold}",
                Value = p.Value, Threshold = threshold, RuleName = rule,
                UnitCode = unit, UnitName = unitName, DeviceName = p.Def.Name,
                At = Ms(DateTime.Now),
            };
            alarm.Timeline.Add(new TimelineEntry { At = alarm.At, Actor = "规则引擎", Text = $"触发规则「{rule}」" });
            rt.Alarms.Add(alarm);
            AddNotification("新告警：" + title, $"{unitName} · {p.Def.Name} {p.Value:F2}{p.Def.Unit}", "alarm");
        }

        Check("SULFUR.PH", "自养脱氮出水 pH 低于下限", "自养脱氮出水 pH 偏低", "major", v => v < 6.8, "pH ≥ 6.80", "sulfur");
        Check("BAF.DO", "预氧化溶解氧不足", "预氧化溶解氧不足", "major", v => v < 2.0, "DO ≥ 2.00 mg/L", "baf");
        Check("RAW.LVL", "进水调节池液位偏低", "进水调节池液位偏低", "major", v => v < 25, "液位 ≥ 25%", "raw");
        Check("PAC.LEVEL", "PAC 药箱余量低", "PAC 药箱余量低", "minor", v => v < 20, "余量 ≥ 20%", "pac");
        Check("PAM.LEVEL", "PAM 药箱余量低", "PAM 药箱余量低", "minor", v => v < 20, "余量 ≥ 20%", "pam");
        Check("SULFUR.DP", "自养脱氮滤层压差偏高", "自养脱氮滤层压差偏高", "minor", v => v > 30, "压差 ≤ 30 kPa", "sulfur");
    }

    private void AddNotification(string title, string body, string kind)
    {
        _notifications.Insert(0, new NotificationInfo
        {
            Id = "N-" + DateTime.Now.Ticks, Title = title, Body = body,
            At = Ms(DateTime.Now), Read = false, Kind = kind,
        });
        if (_notifications.Count > 60) _notifications.RemoveRange(60, _notifications.Count - 60);
    }

    private void RecordAudit(string action, string targetType, string targetId, string detail, string result = "success")
    {
        _audit.Insert(0, new AuditInfo
        {
            Id = "AUD-" + DateTime.Now.Ticks, At = Ms(DateTime.Now),
            Actor = _user?.Name ?? "系统", Action = action, TargetType = targetType,
            TargetId = targetId, Detail = detail, Result = result, Ip = "127.0.0.1",
        });
        if (_audit.Count > 500) _audit.RemoveRange(500, _audit.Count - 500);
    }

    // ============================ 化验 ============================
    public IReadOnlyList<LabMetricDef> LabMetrics => DemoCatalog.LabMetrics();

    public IReadOnlyList<LabRecord> Labs => Rt.Labs.OrderByDescending(l => l.SampledAt).ToList();

    public LabStats LabStatistics(int days)
    {
        var stats = new LabStats();
        var metrics = new[] { "COD", "NH3N", "TN", "TP", "SS", "TURB" };
        var outlet = Rt.Labs.Where(l => l.SamplePoint == "outlet").OrderBy(l => l.SampledAt).ToList();
        var inlet = Rt.Labs.Where(l => l.SamplePoint == "inlet").OrderBy(l => l.SampledAt).ToList();
        foreach (var metric in new[] { "COD", "NH3N" })
        {
            foreach (var point in new[] { "inlet", "outlet" })
            {
                var rows = Rt.Labs.Where(l => l.SamplePoint == point).OrderBy(l => l.SampledAt).ToList();
                var series = new TrendSeries
                {
                    Code = point + "." + metric,
                    Name = (point == "inlet" ? "进水 " : "出水 ") + metric,
                    Unit = "mg/L",
                    Color = point == "inlet" ? "#8A979F" : "#0E7C74",
                };
                foreach (var row in rows)
                {
                    if (row.Metrics.TryGetValue(metric, out var v) && v.HasValue)
                        series.Points.Add(new MetricPoint { T = row.SampledAt, V = v.Value });
                }
                if (series.Points.Count > 0) stats.Series.Add(series);
            }
        }
        foreach (var point in new[] { "inlet", "baf", "outlet" })
        {
            var latest = Rt.Labs.Where(l => l.SamplePoint == point).OrderByDescending(l => l.SampledAt).FirstOrDefault();
            if (latest == null) continue;
            foreach (var metric in metrics)
                if (latest.Metrics.TryGetValue(metric, out var v))
                    stats.LatestByPoint[point + "." + metric] = v;
        }
        foreach (var metric in metrics)
        {
            if (inlet.Count == 0 || outlet.Count == 0) continue;
            var i = inlet.OrderByDescending(l => l.SampledAt).First().Metrics[metric];
            var o = outlet.OrderByDescending(l => l.SampledAt).First().Metrics[metric];
            if (i > 0 && o != null) stats.RemovalRates[metric] = Math.Max(0, (i.Value - o.Value) / i.Value * 100);
        }
        var analyzed = Rt.Labs.Where(l => l.SamplePoint == "outlet" && l.Metrics.ContainsKey("COD")).ToList();
        stats.Total = Rt.Labs.Count;
        stats.Reviewed = Rt.Labs.Count(l => l.Status == "reviewed");
        stats.Compliance = analyzed.Count == 0 ? 100 :
            (int)(analyzed.Count(l => (l.Metrics["COD"] ?? 0) <= 50 && (l.Metrics["NH3N"] ?? 0) <= 5) * 100.0 / analyzed.Count);
        return stats;
    }

    public OpResult CreateLab(string samplePoint, IReadOnlyDictionary<string, double> metrics, string? method = null)
    {
        if (_user?.Can("inspection.execute") != true) return OpResult.Fail("当前账号无化验录入权限");
        var names = new Dictionary<string, string>
        {
            ["inlet"] = "进水（进水调节池）",
            ["baf_out"] = "固液分离出水",
            ["sulfur_out"] = "自养脱氮池出水",
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
    {
        if (_user?.Can("lab.review") != true) return OpResult.Fail("当前账号无化验复核权限");
        var rec = Rt.Labs.FirstOrDefault(l => l.Id == id);
        if (rec == null) return OpResult.Fail("化验记录不存在");
        if (rec.Status != "pending_review") return OpResult.Fail("该记录已复核");
        rec.Status = approve ? "reviewed" : "rejected";
        rec.Reviewer = _user.Name;
        RecordAudit("lab.review", "lab", id, (approve ? "复核通过：" : "复核退回：") + rec.SamplePointName);
        Touch();
        return OpResult.Done(approve ? "复核通过" : "已退回重检");
    }

    // ============================ 诊断 / 分析 ============================
    public IReadOnlyList<DiagnosisInfo> Diagnoses => Rt.Diagnoses.ToList();

    public AnalysisData Analysis(int days)
    {
        var rt = Rt;
        var data = new AnalysisData();
        var dailyVolume = new TrendSeries { Code = "volume", Name = "日处理水量", Unit = "m³", Color = "#0E7C74" };
        var dailyPower = new TrendSeries { Code = "power", Name = "日耗电", Unit = "kWh", Color = "#8A5A12" };
        var dailyCost = new TrendSeries { Code = "cost", Name = "吨水成本", Unit = "元/m³", Color = "#1C6B45" };
        var alarmDaily = new List<KeyValuePair<string, int>>();
        var rnd = new Random(20261026);
        var totalVolume = 0.0;
        for (var i = days - 1; i >= 0; i--)
        {
            var day = DateTime.Today.AddDays(-i);
            var vol = 2.1 + rnd.NextDouble() * 0.35 + (i == 0 ? 0.12 : 0);
            var power = vol * (2.35 + rnd.NextDouble() * 0.12);
            var cost = power * 0.62 + 0.35;
            dailyVolume.Points.Add(new MetricPoint { T = Ms(day), V = Math.Round(vol, 2) });
            dailyPower.Points.Add(new MetricPoint { T = Ms(day), V = Math.Round(power, 2) });
            dailyCost.Points.Add(new MetricPoint { T = Ms(day), V = Math.Round(cost, 2) });
            totalVolume += vol;
            var alarmCount = rt.Alarms.Count(a => FromMs(a.At).Date == day);
            if (alarmCount == 0) alarmCount = rnd.Next(0, 3);
            alarmDaily.Add(new(day.ToString("MM-dd"), alarmCount));
        }
        data.Daily.Add(dailyVolume);
        data.Daily.Add(dailyPower);
        data.Daily.Add(dailyCost);
        data.AlarmDaily = alarmDaily;
        data.CostBreakdown = new()
        {
            new("电费", 0.62), new("药剂", 0.28), new("人工", 0.35), new("维护", 0.12), new("折旧", 0.18),
        };
        var activeAlarms = rt.Alarms.Count(IsOpen);
        var openOrders = rt.WorkOrders.Count(w => w.Status is "pending" or "accepted" or "processing");
        var onlineDevices = rt.Devices.Count(d => d.Online);
        data.Kpis = new List<KpiInfo>
        {
            new() { Key = "volume", Label = "统计期处理水量", Value = totalVolume.ToString("F2"), Unit = "m³", Delta = "日均 " + (totalVolume / days).ToString("F2"), Tone = "normal", Source = "流量积分" },
            new() { Key = "power", Label = "吨水电耗", Value = (rt.TodayPower / Math.Max(rt.TodayVolume, 0.1)).ToString("F2"), Unit = "kWh/m³", Delta = "较上期 -1.4%", Tone = "good", Source = "电能表 PM-801" },
            new() { Key = "dose", Label = "吨水药耗", Value = ((rt.TodayPac + rt.TodayPam) / Math.Max(rt.TodayVolume, 0.1)).ToString("F2"), Unit = "L/m³", Delta = "PAC 1.8 / PAM 1.2 L/h", Tone = "normal", Source = "计量泵" },
            new() { Key = "cost", Label = "吨水综合成本", Value = "1.55", Unit = "元/m³", Delta = "电费占比 40%", Tone = "normal", Source = "财务口径" },
            new() { Key = "compliance", Label = "水质达标率", Value = LabStatistics(days).Compliance + "%", Unit = "", Delta = "按日检记录", Tone = "good", Source = "人工化验" },
            new() { Key = "alarms", Label = "统计期告警", Value = rt.Alarms.Count(a => FromMs(a.At) >= DateTime.Today.AddDays(-days)).ToString(), Unit = "条", Delta = $"活动 {activeAlarms} 条", Tone = activeAlarms > 0 ? "warn" : "good", Source = "规则引擎" },
            new() { Key = "orders", Label = "未闭环工单", Value = openOrders.ToString(), Unit = "单", Delta = "含巡检异常", Tone = openOrders > 0 ? "warn" : "good", Source = "工单系统" },
            new() { Key = "availability", Label = "设备可用率", Value = Pct(onlineDevices, rt.Devices.Count), Unit = "", Delta = "按通信与故障判定", Tone = "good", Source = "设备台账" },
        };
        foreach (var unit in DemoCatalog.Units())
        {
            var readings = rt.Points.Values.Where(p => p.Installed && p.Def.UnitCode == unit.Code).ToList();
            data.Units.Add(new UnitEfficiency
            {
                UnitCode = unit.Code,
                UnitName = unit.Name,
                Readings = readings.Count == 0 ? "无在线仪表" : $"{readings.Count} 个点位：" + string.Join("、", readings.Take(3).Select(r => r.Def.Name)),
                Alarms = rt.Alarms.Count(a => a.UnitCode == unit.Code && IsOpen(a)),
                Health = Math.Clamp(100 - rt.Alarms.Count(a => a.UnitCode == unit.Code && IsOpen(a)) * 12, 40, 100),
                Note = unit.Note,
            });
        }
        data.Notes = new List<string>
        {
            "统计口径：处理水量按进水流量积分，电耗取电能表差值，药耗按计量泵累计量折算。",
            "成本为演示口径（电 0.62 元/kWh、PAC 2.4 元/L、PAM 12 元/L），接入财务后以实际单价核算。",
            "水质达标率仅统计人工化验记录，在线仪表数据不参与判定。",
        };
        return data;
    }

    // ============================ 报表 ============================
    public IReadOnlyList<ReportInfo> Reports => Rt.Reports.OrderByDescending(r => r.CreatedAt).ToList();

    public OpResult GenerateReport(string type, string? from = null, string? to = null, string? customTitle = null)
    {
        if (_user == null) return OpResult.Fail("请先登录");
        if (_user.Can("report.export") != true && _user.Role != "operator") return OpResult.Fail("当前账号无报表生成权限");
        var now = DateTime.Now;
        var id = "RPT-" + now.ToString("yyyyMMdd-HHmmss");
        var title = type switch
        {
            "daily" => "运行日报 · " + now.ToString("yyyy-MM-dd"),
            "weekly" => "运行周报 · " + now.ToString("yyyy-MM-dd"),
            "monthly" => "运行月报 · " + now.ToString("yyyy-MM"),
            _ => "自定义报表 · " + now.ToString("yyyy-MM-dd"),
        };
        var rt = Rt;
        var report = new ReportInfo
        {
            Id = id, SiteId = rt.Info.Id, Type = type, Title = title, Status = "ready",
            CreatedAt = Ms(now), CreatedBy = _user.Name,
            RangeText = type == "monthly" ? now.ToString("yyyy-MM") : now.AddDays(-(type == "daily" ? 0 : 6)).ToString("MM-dd") + " — " + now.ToString("MM-dd"),
            Sections = new List<ReportSection>
            {
                new()
                {
                    Title = "运行概况",
                    Rows = new()
                    {
                        new("站点", rt.Info.Name),
                        new("统计期", type == "daily" ? now.ToString("yyyy-MM-dd") : now.AddDays(-6).ToString("yyyy-MM-dd") + " 至 " + now.ToString("yyyy-MM-dd")),
                        new("处理水量", rt.TodayVolume.ToString("F2") + " m³（今日）"),
                        new("运行设备", rt.Devices.Count(d => d.Online) + " / " + rt.Devices.Count + " 台"),
                        new("活动告警", rt.Alarms.Count(IsOpen) + " 条"),
                        new("未闭环工单", rt.WorkOrders.Count(w => w.Status is "pending" or "accepted" or "processing") + " 单"),
                    },
                },
                new()
                {
                    Title = "水质指标（人工化验）",
                    Rows = DemoCatalog.LabMetrics().Select(m =>
                        new KeyValuePair<string, string>(DemoCatalog.LabPointName("outlet") + " " + m.Name,
                            (LatestLabValue("outlet", m.Key)?.ToString("F" + m.Digits) ?? "待接入") + " " + m.Unit)).ToList(),
                },
                new()
                {
                    Title = "数据来源",
                    Rows = new()
                    {
                        new("在线数据", "边缘网关 GW-1，采集间隔 10 s"),
                        new("化验数据", "人工化验室日检记录"),
                        new("生成时间", now.ToString("yyyy-MM-dd HH:mm:ss")),
                    },
                },
            },
        };
        rt.Reports.Insert(0, report);
        RecordAudit("report.generate", "report", id, title);
        AddNotification("报表已生成", title + " 已生成，可导出 CSV。", "report");
        Touch();
        return OpResult.Done("报表已生成：" + title);
    }

    public OpResult ExportReportCsv(string id, string filePath)
    {
        if (_user?.Can("report.export") != true && _user?.Role != "operator") return OpResult.Fail("当前账号无报表导出权限");
        var report = Rt.Reports.FirstOrDefault(r => r.Id == id);
        if (report == null) return OpResult.Fail("报表不存在");
        try
        {
            var dir = Path.GetDirectoryName(filePath);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir)) Directory.CreateDirectory(dir);
            var sb = new StringBuilder();
            sb.AppendLine("章节,项目,值");
            foreach (var section in report.Sections)
                foreach (var row in section.Rows)
                    sb.AppendLine(Csv(section.Title) + "," + Csv(row.Key) + "," + Csv(row.Value));
            File.WriteAllText(filePath, sb.ToString(), new UTF8Encoding(true));
            RecordAudit("report.export", "report", id, "导出 CSV：" + filePath);
            return OpResult.Done("已导出：" + filePath);
        }
        catch (Exception ex)
        {
            return OpResult.Fail("导出失败：" + ex.Message);
        }
    }

    private static string Csv(string s) => "\"" + (s ?? "").Replace("\"", "\"\"") + "\"";

    // ============================ 工单 / 巡检 / 设备 ============================
    public IReadOnlyList<WorkOrderInfo> WorkOrders(string status = "all")
    {
        IEnumerable<WorkOrderInfo> q = Rt.WorkOrders;
        if (status == "open") q = q.Where(w => w.Status is "pending" or "accepted" or "processing");
        else if (status != "all") q = q.Where(w => w.Status == status);
        return q.OrderByDescending(w => w.CreatedAt).ToList();
    }

    public OpResult AdvanceWorkOrder(string id, string action, string note)
    {
        if (_user?.Can("workorder.handle") != true) return OpResult.Fail("当前账号无工单处理权限");
        var wo = Rt.WorkOrders.FirstOrDefault(w => w.Id == id);
        if (wo == null) return OpResult.Fail("工单不存在");
        switch (action)
        {
            case "accept":
                if (wo.Status != "pending") return OpResult.Fail("仅待接单状态可接单");
                wo.Status = "accepted";
                wo.Timeline.Add(new TimelineEntry { At = Ms(DateTime.Now), Actor = _user.Name, Text = "接单" });
                break;
            case "process":
                if (wo.Status != "accepted") return OpResult.Fail("仅已接单状态可开始处理");
                wo.Status = "processing";
                wo.Timeline.Add(new TimelineEntry { At = Ms(DateTime.Now), Actor = _user.Name, Text = "开始处理" + (string.IsNullOrWhiteSpace(note) ? "" : "：" + note) });
                break;
            case "done":
                if (wo.Status is not ("accepted" or "processing")) return OpResult.Fail("当前状态无法完成");
                wo.Status = "done";
                wo.DoneAt = Ms(DateTime.Now);
                wo.Result = string.IsNullOrWhiteSpace(note) ? "处理完成" : note;
                wo.Timeline.Add(new TimelineEntry { At = wo.DoneAt.Value, Actor = _user.Name, Text = "完成：" + wo.Result });
                break;
            case "close":
                if (wo.Status != "done") return OpResult.Fail("仅已完成工单可关闭");
                wo.Status = "closed";
                wo.Timeline.Add(new TimelineEntry { At = Ms(DateTime.Now), Actor = _user.Name, Text = "验收关闭" });
                break;
            default:
                return OpResult.Fail("未知操作");
        }
        RecordAudit("workorder." + action, "workorder", id, wo.Title);
        Touch();
        return OpResult.Done("工单已" + (action switch { "accept" => "接单", "process" => "进入处理中", "done" => "完成", _ => "关闭" }));
    }

    public OpResult AssignWorkOrder(string id, string userId, string note)
    {
        if (_user?.Can("workorder.assign") != true) return OpResult.Fail("当前账号无派单权限");
        var wo = Rt.WorkOrders.FirstOrDefault(w => w.Id == id);
        if (wo == null) return OpResult.Fail("工单不存在");
        if (wo.Status is not ("pending" or "accepted" or "processing")) return OpResult.Fail("当前状态无法派发");
        var target = Accounts.FirstOrDefault(p => "U-" + p.Key == userId);
        if (string.IsNullOrEmpty(target.Key)) return OpResult.Fail("指派对象不存在");
        wo.Assignee = target.Value.Name;
        if (wo.Status == "pending") wo.Status = "accepted";
        wo.Timeline.Add(new TimelineEntry { At = Ms(DateTime.Now), Actor = _user.Name, Text = "派发给 " + target.Value.Name + (string.IsNullOrWhiteSpace(note) ? "" : "：" + note) });
        RecordAudit("workorder.assign", "workorder", id, wo.Title);
        Touch();
        return OpResult.Done("工单已派发");
    }

    public OpResult CreateWorkOrder(string title, string type, string priority, string unitCode, string? assigneeId, string description, string? alarmId = null)
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

    public IReadOnlyList<InspectionPlanInfo> InspectionPlans => new List<InspectionPlanInfo>();

    public OpResult CreateInspection(string planId, string? assigneeId, DateTime? dueAt) => GenerateInspection();

    public IReadOnlyList<InspectionInfo> Inspections => Rt.Inspections.OrderBy(i => i.DueAt).ToList();

    public OpResult GenerateInspection()
    {
        if (_user?.Can("inspection.execute") != true && _user?.Can("admin.config") != true)
            return OpResult.Fail("当前账号无巡检执行权限");
        var due = DateTime.Today.AddDays(1).AddHours(10);
        var items = new (string, string)[]
        {
            ("pump", "提升泵运行与渗漏"), ("blower", "曝气风机运行与电流"), ("valve", "阀门开度与气密"),
            ("instrument", "在线仪表读数与清洗"), ("plc", "控制柜指示与接线"), ("dosage", "药箱液位与投加量"),
            ("bw", "反冲洗系统状态"), ("env", "现场卫生与安全标识"),
        };
        var ins = new InspectionInfo
        {
            Id = "INS-" + DateTime.Now.ToString("yyyyMMdd-HHmmss"),
            SiteId = Rt.Info.Id, Plan = "日常巡检（临时新增）", Status = "pending",
            Assignee = _user.Name, DueAt = Ms(due),
            Items = items.Select(i => new InspectionItem { Key = i.Item1, Name = i.Item2 }).ToList(),
        };
        Rt.Inspections.Add(ins);
        RecordAudit("inspection.create", "inspection", ins.Id, ins.Plan);
        Touch();
        return OpResult.Done("已生成巡检任务，截止 " + due.ToString("MM-dd HH:mm"));
    }

    public OpResult SubmitInspection(string id, string summary, IReadOnlyList<InspectionItemInput> inputs)
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
    }

    public IReadOnlyList<DeviceInfo> Devices => Rt.Devices.OrderByDescending(d => d.Online).ThenBy(d => d.Code).ToList();

    public OpResult RegisterMaintenance(string id, string note)
    {
        if (_user?.Can("workorder.handle") != true) return OpResult.Fail("当前账号无设备维护权限");
        var d = Rt.Devices.FirstOrDefault(x => x.Id == id);
        if (d == null) return OpResult.Fail("设备不存在");
        d.LastMaintAt = DateTime.Now.ToString("yyyy-MM-dd");
        d.Health = Math.Min(100, d.Health + 15);
        RecordAudit("device.maintain", "device", id, (note ?? "") + "（" + d.Name + "）");
        AddNotification("设备维护已登记", d.Name + " 已完成维护登记。", "device");
        Touch();
        return OpResult.Done("已登记维护，健康度更新为 " + d.Health + "%");
    }

    // ============================ 系统管理 ============================
    public IReadOnlyList<UserRowInfo> Users
    {
        get
        {
        var list = new List<UserRowInfo>();
        foreach (var pair in Accounts)
        {
            var acc = pair.Value;
            list.Add(new UserRowInfo
            {
                User = new UserInfo
                {
                    Id = "U-" + pair.Key, Username = pair.Key, Name = acc.Name, Role = acc.Role,
                    RoleName = RoleName(acc.Role), Title = acc.Title, Phone = acc.Phone,
                    Status = acc.Status, Perms = RolePerms[acc.Role].ToList(),
                    SiteIds = SitesFor(acc.Role, pair.Key),
                    LastLoginAt = pair.Key == "admin" ? DateTime.Now.ToString("yyyy-MM-dd HH:mm") : DateTime.Now.AddDays(-1).ToString("yyyy-MM-dd HH:mm"),
                },
            });
        }
        return list;
        }
    }

    private static List<string> SitesFor(string role, string username) => role switch
    {
        "super" or "region" or "viewer" or "maintainer" => new List<string> { "site-1", "site-2" },
        "operator" when username == "sun" => new List<string> { "site-2" },
        _ => new List<string> { "site-1" },
    };

    public IReadOnlyList<RoleInfo> Roles => new List<RoleInfo>
    {
        new() { Key = "super", Name = "平台管理员", Desc = "全部站点、全部功能", Perms = RolePerms["super"].ToList(), Sites = "all", UserCount = 1 },
        new() { Key = "region", Name = "区域管理员", Desc = "所辖站点运行与报表", Perms = RolePerms["region"].ToList(), Sites = "assigned", UserCount = 1 },
        new() { Key = "process", Name = "工艺工程师", Desc = "参数设置、诊断与化验复核", Perms = RolePerms["process"].ToList(), Sites = "assigned", UserCount = 1 },
        new() { Key = "operator", Name = "运维操作员", Desc = "设备控制、告警与巡检", Perms = RolePerms["operator"].ToList(), Sites = "assigned", UserCount = 2 },
        new() { Key = "maintainer", Name = "维修工程师", Desc = "工单与设备维护", Perms = RolePerms["maintainer"].ToList(), Sites = "assigned", UserCount = 1 },
        new() { Key = "viewer", Name = "监管访客", Desc = "只读查看", Perms = RolePerms["viewer"].ToList(), Sites = "assigned", UserCount = 1 },
    };

    public IReadOnlyList<KeyValuePair<string, string>> Settings => _settings.ToList();

    public OpResult SaveSetting(string key, string value)
    {
        if (_user?.Can("admin.config") != true) return OpResult.Fail("当前账号无配置权限");
        var idx = _settings.FindIndex(kv => kv.Key == key);
        if (idx < 0) return OpResult.Fail("配置项不存在");
        _settings[idx] = new KeyValuePair<string, string>(key, value);
        RecordAudit("admin.config.save", "setting", key, "修改为：" + value);
        Touch();
        return OpResult.Done("配置已保存（演示环境不持久化）");
    }

    public IReadOnlyList<ChannelInfo> Channels => _channels.ToList();

    public OpResult ToggleChannel(string id)
    {
        if (_user?.Can("admin.config") != true) return OpResult.Fail("当前账号无配置权限");
        var ch = _channels.FirstOrDefault(c => c.Id == id);
        if (ch == null) return OpResult.Fail("通道不存在");
        ch.Enabled = !ch.Enabled;
        ch.LastResult = ch.Enabled ? "已启用" : "未启用";
        RecordAudit("admin.channel.toggle", "channel", id, (ch.Enabled ? "启用 " : "停用 ") + ch.Name);
        Touch();
        return OpResult.Done(ch.Name + (ch.Enabled ? " 已启用" : " 已停用"));
    }

    public OpResult TestChannel(string id)
    {
        if (_user?.Can("admin.config") != true) return OpResult.Fail("当前账号无配置权限");
        var ch = _channels.FirstOrDefault(c => c.Id == id);
        if (ch == null) return OpResult.Fail("通道不存在");
        if (!ch.Enabled) return OpResult.Fail("通道未启用，无法测试");
        ch.LastTestAt = DateTime.Now.ToString("yyyy-MM-dd HH:mm");
        ch.LastResult = "成功（演示）";
        RecordAudit("admin.channel.test", "channel", id, "测试 " + ch.Name);
        Touch();
        return OpResult.Done("测试消息已发送：" + ch.Name);
    }

    public IReadOnlyList<AuditInfo> AuditLogs(int limit = 200) => _audit.OrderByDescending(a => a.At).Take(limit).ToList();

    public IReadOnlyList<BackupInfo> Backups => _backups.OrderByDescending(b => b.At).ToList();

    public OpResult CreateBackup()
    {
        if (_user?.Can("admin.config") != true) return OpResult.Fail("当前账号无备份权限");
        var now = DateTime.Now;
        var bk = new BackupInfo
        {
            Id = "BK-" + now.ToString("yyyyMMdd-HHmmss"), At = Ms(now), Size = "2.6 MB",
            By = _user.Name + "（手动）", IsAuto = false, Note = "手动创建备份",
        };
        _backups.Insert(0, bk);
        RecordAudit("admin.backup.create", "backup", bk.Id, "手动备份");
        Touch();
        return OpResult.Done("备份已创建：" + bk.Id);
    }

    public OpResult RestoreBackup(string id)
    {
        if (_user?.Can("admin.config") != true) return OpResult.Fail("当前账号无备份恢复权限");
        var bk = _backups.FirstOrDefault(b => b.Id == id);
        if (bk == null) return OpResult.Fail("备份不存在");
        RecordAudit("admin.backup.restore", "backup", id, "恢复备份 " + bk.Id);
        Touch();
        return OpResult.Done("已开始恢复（演示环境仅记录审计）");
    }

    public OpResult AddUser(string username, string name, string role, string phone)
    {
        if (_user?.Can("admin.users") != true) return OpResult.Fail("当前账号无用户管理权限");
        username = (username ?? "").Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(name)) return OpResult.Fail("账号与姓名不能为空");
        if (Accounts.ContainsKey(username)) return OpResult.Fail("账号已存在");
        if (!RolePerms.ContainsKey(role)) return OpResult.Fail("角色不存在");
        Accounts[username] = (name, role, RoleName(role), phone ?? "", "active");
        RecordAudit("admin.user.add", "user", "U-" + username, $"{name}（{RoleName(role)}）");
        Touch();
        return OpResult.Done("用户已创建，初始密码 water123");
    }

    public OpResult ResetPassword(string userId)
    {
        if (_user?.Can("admin.users") != true) return OpResult.Fail("当前账号无用户管理权限");
        var username = userId.StartsWith("U-") ? userId.Substring(2) : userId;
        if (!Accounts.ContainsKey(username)) return OpResult.Fail("用户不存在");
        RecordAudit("admin.user.reset", "user", userId, "重置密码为初始口令");
        return OpResult.Done("密码已重置为 water123（演示环境不持久化）");
    }

    public OpResult SetUserStatus(string userId, bool active)
    {
        if (_user?.Can("admin.users") != true) return OpResult.Fail("当前账号无用户管理权限");
        var username = userId.StartsWith("U-") ? userId.Substring(2) : userId;
        if (!Accounts.TryGetValue(username, out var acc)) return OpResult.Fail("用户不存在");
        if (username == _user.Username && !active) return OpResult.Fail("不能停用当前登录账号");
        Accounts[username] = (acc.Name, acc.Role, acc.Title, acc.Phone, active ? "active" : "inactive");
        RecordAudit("admin.user.status", "user", userId, active ? "启用账号" : "停用账号");
        Touch();
        return OpResult.Done(active ? "账号已启用" : "账号已停用");
    }

    // ============================ 通知 / 现场屏 ============================
    public IReadOnlyList<NotificationInfo> Notifications => _notifications.ToList();
    public int UnreadNotifications => _notifications.Count(n => !n.Read);

    public void MarkNotificationsRead()
    {
        foreach (var n in _notifications) n.Read = true;
        Touch();
    }

    public void MarkNotificationRead(string id)
    {
        var item = _notifications.FirstOrDefault(n => n.Id == id);
        if (item == null || item.Read) return;
        item.Read = true;
        Touch();
    }

    /* ---------------- 自动控制（演示数据不模拟执行） ---------------- */

    public AutoSnapshot Automation() => new()
    {
        Enabled = true,
        AlarmRuleTotal = 0,
        AlarmRuleEnabled = 0,
        Rules = new List<AutoRuleInfo>(),
        Events = new List<AutoEventInfo>(),
    };

    public OpResult SetAutomationEnabled(bool enabled) => OpResult.Done("演示数据不支持自动化");

    public OpResult ToggleAutomationRule(string id, bool enabled) => OpResult.Done("演示数据不支持自动化");

    public OpResult RunAutomationRule(string id) => OpResult.Fail("演示数据不支持自动化");
}
