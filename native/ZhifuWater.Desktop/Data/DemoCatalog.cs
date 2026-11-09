using System;
using System.Collections.Generic;
using System.Linq;

namespace ZhifuWater.Desktop.Data;

// =============================================================================
// 演示数据资产目录：与 server/seed/assets.js 保持同一套站点 / 单元 / 点位 / 设备 /
// 告警规则 / 参数 / 化验指标命名，接线 CoreServices 后本目录仅用于缺省兜底。
// =============================================================================

internal sealed class PointSeed
{
    public string Code = "";
    public string Name = "";
    public string UnitCode = "";
    public string Type = "measure"; // measure/run/state/counter/alarm
    public double Base;
    public double Min;
    public double Max;
    public double Wave;
    public string Range = "";
    public string Unit = "";
    public int Digits = 2;
    public int Interval = 10;
    public string Writable = "read";
    public string Provenance = "gateway";
    public string Desc = "";
    public bool Optional;
}

internal static class DemoCatalog
{
    internal static long Ms(DateTime d) => new DateTimeOffset(d).ToUnixTimeMilliseconds();

    public static readonly string[] UnitCodes = { "raw", "grit", "primary", "dist1", "baf", "pac", "pam", "dist2", "sulfur", "clear", "waste" };

    public static List<UnitInfo> Units() => new()
    {
        new() { Code = "raw", Name = "进水调节池", Short = "原料", Kind = "储存", Note = "原水收集与提升，液位低于 25% 触发重要告警" },
        new() { Code = "grit", Name = "格栅池", Short = "格栅", Kind = "预处理", Note = "拦截毛发、纤维等大颗粒杂物" },
        new() { Code = "primary", Name = "序批预氧化池", Short = "初沉", Kind = "预处理", Note = "重力沉淀，降低后续滤池负荷" },
        new() { Code = "dist1", Name = "配水槽1", Short = "配水1", Kind = "配水", Note = "进水流量计量与向 固液分离均量配水" },
        new() { Code = "baf", Name = "固液分离池", Short = "固液分离", Kind = "生化", Note = "固液分离池，承担有机物与氨氮去除" },
        new() { Code = "pac", Name = "PAC 加药池", Short = "PAC", Kind = "加药", Note = "聚合氯化铝混凝，药箱余量低于 20% 提醒补药" },
        new() { Code = "pam", Name = "PAM 加药池", Short = "PAM", Kind = "加药", Note = "聚丙烯酰胺助凝，强化絮体沉降" },
        new() { Code = "dist2", Name = "中间水池", Short = "配水2", Kind = "配水", Note = "向自养脱氮池均匀配水" },
        new() { Code = "sulfur", Name = "自养脱氮池", Short = "自养脱氮", Kind = "深度脱氮", Note = "自养深度脱氮深度脱氮，pH 6.8–7.6 为控制区间" },
        new() { Code = "clear", Name = "清水池", Short = "清水", Kind = "储存", Note = "达标出水储存与回用" },
        new() { Code = "waste", Name = "废水水箱", Short = "废水", Kind = "储存", Note = "反冲洗废水收集，纳入废水回用" },
    };

    public static List<SiteInfo> Sites(DateTime now) => new()
    {
        new()
        {
            Id = "site-1", Name = "安吉·鲁家村示范站", ShortName = "鲁家村站", Region = "浙江·湖州安吉",
            Area = "鲁家村", Address = "浙江省湖州市安吉县鲁家村", Process = "序批式预氧化 - 固液分离耦合自养深度脱氮",
            Capacity = "100 L/h", DeviceRef = "鲁家村站一期", CommissionedAt = "2026-08-18",
            Contact = "沈工 138-0572-1136", Status = "online",
            Note = "农业农村生活污水单户/联户型示范装置，出水执行一级 A 标准。",
        },
        new()
        {
            Id = "site-2", Name = "黟县·碧山复制试点站", ShortName = "碧山站", Region = "安徽·黄山黟县",
            Area = "碧山村", Address = "安徽省黄山市黟县碧山村", Process = "鲁家村站工艺复制版",
            Capacity = "100 L/h", DeviceRef = "碧山站复制试点", CommissionedAt = "2026-09-26",
            Contact = "柯工 139-0559-7281", Status = "online",
            Note = "复制试点，选配点位（进水流量、电能）尚未安装，相关指标标「待接入」。",
        },
    };

    public static List<PointSeed> Points()
    {
        var l = new List<PointSeed>();
        void P(string code, string name, string unit, string type, double b, double min, double max,
            double wave, string range, string u, int dg, int iv, string writable = "read",
            string prov = "gateway", string desc = "", bool optional = false)
        {
            l.Add(new PointSeed
            {
                Code = code, Name = name, UnitCode = unit, Type = type, Base = b, Min = min, Max = max,
                Wave = wave, Range = range, Unit = u, Digits = dg, Interval = iv, Writable = writable,
                Provenance = prov, Desc = desc, Optional = optional,
            });
        }

        P("RAW.LVL", "进水调节池液位", "raw", "measure", 22.6, 0, 100, 1.8, "0–100%", "%", 1, 10, desc: "投入式液位计，10 秒采集");
        P("RAW.PUMP.RUN", "提升泵运行", "raw", "run", 1, 0, 1, 0, "0/1", "", 0, 10, "write", desc: "远程启停，受液位联锁");
        P("RAW.PUMP.FAULT", "提升泵故障", "raw", "alarm", 0, 0, 1, 0, "0/1", "", 0, 10, desc: "热继电器 + 运行反馈不一致判定");
        P("RAW.PUMP.MODE", "提升泵模式", "raw", "state", 1, 0, 1, 0, "自动/手动", "", 0, 30, "write");
        P("RAW.PUMP.HOURS", "提升泵累计运行", "raw", "counter", 1286.5, 0, 999999, 0, "h", "h", 1, 60);
        P("RAW.PUMP.STARTS", "提升泵启停次数", "raw", "counter", 412, 0, 999999, 0, "次", "次", 0, 60);
        P("FLOW.IN", "进水瞬时流量", "dist1", "measure", 96, 0, 120, 6, "0–120 L/h", "L/h", 1, 5, optional: true,
            desc: "电磁流量计 FT-101，选配点位");
        P("BAF.PH", "固液分离出水 pH", "baf", "measure", 7.15, 5, 9, 0.15, "5–9", "pH", 2, 10, desc: "在线 pH 计 pH-201");
        P("BAF.DO", "预氧化溶解氧", "baf", "measure", 1.78, 0, 8, 0.22, "0–8 mg/L", "mg/L", 2, 10, desc: "在线 DO 仪 DO-201");
        P("BAF.BLOWER.RUN", "曝气风机运行", "baf", "run", 1, 0, 1, 0, "0/1", "", 0, 10, "write");
        P("BAF.BLOWER.CURRENT", "曝气风机电流", "baf", "measure", 3.4, 0, 8, 0.3, "0–8 A", "A", 2, 10);
        P("BAF.BW.STATE", "固液分离反冲阶段", "baf", "state", 0, 0, 3, 0, "待机/气冲/气水联合/漂洗", "", 0, 10);
        P("BAF.BW.COUNT", "固液分离反冲累计", "baf", "counter", 36, 0, 999999, 0, "次", "次", 0, 60);
        P("BAF.DP", "固液分离滤层压差", "baf", "measure", 18, 0, 60, 2.5, "0–60 kPa", "kPa", 1, 10, desc: "压差变送器 DP-201");
        P("PAC.PUMP.RUN", "PAC 加药泵运行", "pac", "run", 1, 0, 1, 0, "0/1", "", 0, 10, "write");
        P("PAC.DOSE", "PAC 投加量", "pac", "measure", 1.8, 0, 5, 0.2, "0–5 L/h", "L/h", 2, 10);
        P("PAC.LEVEL", "PAC 药箱余量", "pac", "measure", 18.4, 0, 100, 0.8, "0–100%", "%", 1, 10);
        P("PAC.TOTAL", "PAC 累计投加", "pac", "counter", 128.6, 0, 999999, 0, "L", "L", 1, 60);
        P("PAC.MIXER.RUN", "PAC 搅拌机运行", "pac", "run", 1, 0, 1, 0, "0/1", "", 0, 10, "write");
        P("PAM.PUMP.RUN", "PAM 加药泵运行", "pam", "run", 1, 0, 1, 0, "0/1", "", 0, 10, "write");
        P("PAM.DOSE", "PAM 投加量", "pam", "measure", 1.2, 0, 5, 0.2, "0–5 L/h", "L/h", 2, 10);
        P("PAM.LEVEL", "PAM 药箱余量", "pam", "measure", 55, 0, 100, 3, "0–100%", "%", 1, 10);
        P("PAM.TOTAL", "PAM 累计投加", "pam", "counter", 96.2, 0, 999999, 0, "L", "L", 1, 60);
        P("PAM.MIXER.RUN", "PAM 搅拌机运行", "pam", "run", 1, 0, 1, 0, "0/1", "", 0, 10, "write");
        P("SULFUR.PH", "自养脱氮出水 pH", "sulfur", "measure", 6.76, 5, 9, 0.07, "5–9", "pH", 2, 10, desc: "在线 pH 计 pH-501");
        P("SULFUR.DO", "自养脱氮溶解氧", "sulfur", "measure", 1.35, 0, 6, 0.25, "0–6 mg/L", "mg/L", 2, 10, desc: "在线 DO 仪 DO-501");
        P("SULFUR.P", "自养脱氮出水总磷", "sulfur", "measure", 0.32, 0, 3, 0.05, "0–3 mg/L", "mg/L", 2, 30, desc: "总磷在线分析仪（选配）");
        P("SULFUR.BW.STATE", "自养脱氮反冲洗阶段", "sulfur", "state", 0, 0, 3, 0, "待机/气冲/气水联合/漂洗", "", 0, 10);
        P("SULFUR.BW.COUNT", "自养脱氮反冲洗累计", "sulfur", "counter", 24, 0, 999999, 0, "次", "次", 0, 60);
        P("SULFUR.DP", "自养脱氮滤层压差", "sulfur", "measure", 24, 0, 60, 3, "0–60 kPa", "kPa", 1, 10, desc: "压差变送器 DP-501");
        P("CLEAR.LVL", "清水池液位", "clear", "measure", 58, 0, 100, 3, "0–100%", "%", 1, 10);
        P("WASTE.LVL", "废水箱液位", "waste", "measure", 34, 0, 100, 4, "0–100%", "%", 1, 10);
        P("POWER.KW", "实时功率", "plant", "measure", 2.35, 0, 6, 0.15, "0–6 kW", "kW", 2, 10, optional: true, desc: "电能表 PM-801，选配");
        P("ENERGY.KWH", "累计电量", "plant", "counter", 4862.4, 0, 9999999, 0, "kWh", "kWh", 1, 60, optional: true, desc: "电能表 PM-801，选配");
        return l;
    }

    public static List<DeviceInfo> Devices(string siteId, DateTime now)
    {
        var list = new List<DeviceInfo>();
        void D(string code, string name, string unit, string type, string model, string spec, string pl, int cycle)
        {
            list.Add(new DeviceInfo
            {
                Id = siteId + "-" + code.ToLowerInvariant().Replace('-', '_'),
                SiteId = siteId, Code = code, Name = name, UnitCode = unit,
                UnitName = Units().FirstOrDefault(u => u.Code == unit)?.Name ?? "公共系统与自控",
                Type = type, Model = model, Spec = spec,
                PlAddress = pl, MaintCycleDays = cycle,
                LastMaintAt = now.AddDays(-(cycle / 3)).ToString("yyyy-MM-dd"),
                WarrantyUntil = now.AddMonths(12).ToString("yyyy-MM-dd"),
                InstallDate = now.AddMonths(-2).ToString("yyyy-MM-dd"),
            });
        }

        D("LT-101", "进水调节池液位计", "raw", "液位仪表", "投入式静压液位计", "0–2 m / 4–20 mA", "AIW0", 90);
        D("P-101", "提升泵", "raw", "水泵", "潜水排污泵", "0.75 kW / 10 m³·h⁻¹", "DO1", 180);
        D("FT-101", "电磁流量计", "dist1", "流量仪表", "DN15 电磁流量计", "0.1–1.5 m³/h", "AIW2", 180);
        D("pH-201", "固液分离出水 pH 计", "baf", "在线仪表", "玻璃电极 pH", "0–14 / 4–20 mA", "AIW4", 60);
        D("DO-201", "预氧化溶解氧仪", "baf", "在线仪表", "荧光法 DO", "0–20 mg/L", "AIW6", 60);
        D("B-201", "曝气风机", "baf", "风机", "旋涡气泵", "0.55 kW / 60 L·min⁻¹", "DO3", 180);
        D("P-202", "固液分离反冲泵", "baf", "水泵", "不锈钢离心泵", "0.55 kW / 1.2 m³·h⁻¹", "DO5", 180);
        D("V-203", "固液分离反冲阀", "baf", "阀门", "气动蝶阀", "DN25 常闭", "DO7", 180);
        D("DP-201", "固液分离压差变送器", "baf", "在线仪表", "差压变送器", "0–60 kPa", "AIW8", 90);
        D("P-301", "PAC 加药泵", "pac", "计量泵", "隔膜计量泵", "0–5 L/h", "DO9", 180);
        D("M-302", "PAC 搅拌机", "pac", "搅拌机", "立式搅拌机", "0.18 kW", "DO11", 180);
        D("P-401", "PAM 加药泵", "pam", "计量泵", "隔膜计量泵", "0–5 L/h", "DO13", 180);
        D("M-402", "PAM 搅拌机", "pam", "搅拌机", "立式搅拌机", "0.18 kW", "DO15", 180);
        D("pH-501", "自养脱氮 pH 计", "sulfur", "在线仪表", "玻璃电极 pH", "0–14 / 4–20 mA", "AIW10", 60);
        D("DO-501", "自养脱氮 DO 仪", "sulfur", "在线仪表", "荧光法 DO", "0–20 mg/L", "AIW12", 60);
        D("PT-501", "自养脱氮压力变送器", "sulfur", "在线仪表", "压力变送器", "0–0.6 MPa", "AIW14", 90);
        D("P-501", "自养脱氮反冲洗泵", "sulfur", "水泵", "不锈钢离心泵", "0.55 kW", "DO17", 180);
        D("V-502", "自养脱氮反冲洗阀", "sulfur", "阀门", "气动蝶阀", "DN25 常闭", "DO19", 180);
        D("DP-501", "自养脱氮压差变送器", "sulfur", "在线仪表", "差压变送器", "0–60 kPa", "AIW16", 90);
        D("LT-601", "清水池液位计", "clear", "液位仪表", "投入式液位计", "0–2 m", "AIW18", 90);
        D("LT-701", "废水箱液位计", "waste", "液位仪表", "投入式液位计", "0–2 m", "AIW20", 90);
        D("PM-801", "电能表", "plant", "电力仪表", "单相导轨电能表", "0–6 kW", "AIW22", 365);
        D("PLC-1", "主控 PLC", "plant", "自控设备", "西门子 S7-1200", "14DI/10DO/4AI", "192.168.1.10", 365);
        D("GW-1", "边缘网关", "plant", "自控设备", "工业网关", "4G + 以太网", "192.168.1.11", 365);
        return list;
    }

    public static List<ParamInfo> Params(string siteId, DateTime now)
    {
        var list = new List<ParamInfo>();
        void P(string key, string name, string group, double cur, double min, double max, double step,
            string unit, string mode, string desc)
        {
            list.Add(new ParamInfo
            {
                Id = siteId + "-" + key.ToLowerInvariant(),
                SiteId = siteId, Key = key, Name = name, Group = group, Current = cur,
                Min = min, Max = max, Step = step, Unit = unit, WriteMode = mode,
                Version = 1, UpdatedAt = now.AddDays(-3).ToString("yyyy-MM-dd HH:mm"),
                UpdatedBy = "王敏",
                Versions = new List<ParamVersion>
                {
                    new() { Version = 1, Value = cur, At = now.AddDays(-3).ToString("yyyy-MM-dd HH:mm"), By = "王敏", Reason = "初始整定" },
                },
                Desc = desc,
            });
        }

        P("FLOW_SET", "进水流量设定", "工艺运行", 96, 20, 120, 1, "L/h", "cloud", "恒流量控制的目标值");
        P("RAW_LVL_HIGH", "进水调节池高液位", "工艺运行", 95, 80, 100, 1, "%", "local", "达到后停止提升泵");
        P("RAW_LVL_LOW", "进水调节池低液位", "工艺运行", 25, 5, 40, 1, "%", "local", "低于后停泵并触发重要告警");
        P("固液分离_EBCT", "固液分离空塔停留时间", "工艺运行", 45, 20, 90, 5, "min", "cloud", "按设计水量折算");
        P("固液分离_AIR", "预氧化曝气量", "工艺运行", 60, 20, 100, 1, "L/min", "cloud", "与 DO 串级");
        P("PAC_DOSE", "PAC 投加量设定", "工艺运行", 1.8, 0.2, 4, 0.1, "L/h", "cloud", "按进水浊度前馈");
        P("PAM_DOSE", "PAM 投加量设定", "工艺运行", 1.2, 0.1, 3, 0.1, "L/h", "cloud", "与 PAC 比例投加");
        P("SULFUR_HRT", "自养脱氮停留时间", "工艺运行", 90, 40, 180, 5, "min", "cloud", "深度脱氮核心参数");
        P("BW_INTERVAL", "反冲洗周期", "工艺运行", 24, 8, 72, 1, "h", "cloud", "按压差/周期双触发");
        P("BW_AIR", "反冲洗气冲时长", "工艺运行", 6, 2, 15, 1, "min", "local", "气冲阶段持续时长");
        P("BW_WATER", "反冲洗水洗时长", "工艺运行", 8, 2, 20, 1, "min", "local", "漂洗阶段持续时长");
        P("PH_LOW", "pH 下限报警", "出水与报警阈值", 6.8, 5, 8, 0.1, "pH", "cloud", "自养深度脱氮适宜区间下限");
        P("PH_HIGH", "pH 上限报警", "出水与报警阈值", 7.6, 6, 9, 0.1, "pH", "cloud", "超过后影响反硝化效率");
        P("DO_LOW", "DO 下限报警", "出水与报警阈值", 2.0, 0.5, 5, 0.1, "mg/L", "cloud", "固液分离好氧区最低溶解氧");
        P("DP_HIGH", "压差上限报警", "出水与报警阈值", 25, 10, 60, 1, "kPa", "cloud", "超过后自动触发反冲洗");
        P("SAMPLE_INTERVAL", "采集间隔", "采集与通道", 10, 5, 60, 5, "s", "local", "网关轮询周期");
        P("UPLOAD_INTERVAL", "上传间隔", "采集与通道", 60, 10, 300, 10, "s", "local", "平台数据上报周期");
        P("OFFLINE_TIMEOUT", "离线判定时长", "采集与通道", 90, 30, 300, 10, "s", "local", "超过判为数据陈旧");
        return list;
    }

    public static List<AlarmRuleInfo> AlarmRules() => new()
    {
        new() { Id = "rule-1", Key = "SULFUR_PH_LOW", Name = "自养脱氮出水 pH 低于下限", PointCode = "SULFUR.PH", Level = "major", Condition = "pH < 6.80 连续 3 个采样点", Desc = "反硝化菌活性受抑制，需核查碱度与进水氨氮负荷" },
        new() { Id = "rule-2", Key = "固液分离_DO_LOW", Name = "预氧化溶解氧不足", PointCode = "BAF.DO", Level = "major", Condition = "DO < 2.00 mg/L 连续 2 个采样点", Desc = "曝气不足将直接影响有机物与氨氮去除" },
        new() { Id = "rule-3", Key = "RAW_LVL_LOW", Name = "进水调节池液位偏低", PointCode = "RAW.LVL", Level = "major", Condition = "液位 < 25%", Desc = "存在抽空风险，需联动停泵" },
        new() { Id = "rule-4", Key = "PAC_LEVEL_LOW", Name = "PAC 药箱余量低", PointCode = "PAC.LEVEL", Level = "minor", Condition = "余量 < 20%", Desc = "提前安排补药" },
        new() { Id = "rule-5", Key = "PAM_LEVEL_LOW", Name = "PAM 药箱余量低", PointCode = "PAM.LEVEL", Level = "minor", Condition = "余量 < 20%", Desc = "提前安排补药" },
        new() { Id = "rule-6", Key = "FLOW_ZERO", Name = "进水流量为零", PointCode = "FLOW.IN", Level = "major", Condition = "流量 = 0 且提升泵运行中持续 5 min", Desc = "排查泵体气蚀、管路堵塞与流量计信号" },
        new() { Id = "rule-7", Key = "BW_PRESSURE_HIGH", Name = "反冲洗压力偏高", PointCode = "SULFUR.DP", Level = "minor", Condition = "反冲洗压力 > 0.60 MPa", Desc = "核查阀门开度与滤头堵塞" },
        new() { Id = "rule-8", Key = "SULFUR_DP_HIGH", Name = "自养脱氮滤层压差偏高", PointCode = "SULFUR.DP", Level = "minor", Condition = "压差 > 25 kPa", Desc = "接近反冲洗触发值，关注堵塞趋势" },
        new() { Id = "rule-9", Key = "LW_LVL_HIGH", Name = "清水池液位偏高", PointCode = "CLEAR.LVL", Level = "info", Condition = "液位 > 90%", Desc = "提示出水受阻或回用量下降" },
        new() { Id = "rule-10", Key = "GW_OFFLINE", Name = "边缘网关离线", PointCode = "GW-1", Level = "critical", Condition = "心跳丢失 > 3 min", Desc = "数据中断，需现场确认网络与供电" },
    };

    public static List<ActionInfo> Actions() => new()
    {
        new() { Key = "raw.pump.start", Label = "提升泵启动", Device = "P-101 提升泵", UnitCode = "raw", Risk = "normal", NeedsConfirm = true,
            Desc = "启动进水调节池提升泵，向格栅池供水。", Interlock = "液位 ≥ 低液位 25%，否则拒绝启动",
            Constraints = new() { "需 control 权限", "液位 ≥ 25%", "无提升泵故障信号" } },
        new() { Key = "raw.pump.stop", Label = "提升泵停止", Device = "P-101 提升泵", UnitCode = "raw", Risk = "normal", NeedsConfirm = true,
            Desc = "停止提升泵，进水随之停止。", Interlock = "与加药、反冲洗无强联锁",
            Constraints = new() { "需 control 权限", "确认后续单元允许断水 30 min" } },
        new() { Key = "baf.blower.start", Label = "曝气风机启动", Device = "B-201 曝气风机", UnitCode = "baf", Risk = "normal", NeedsConfirm = true,
            Desc = "启动曝气风机，恢复 固液分离供氧。", Interlock = "反冲洗气冲阶段自动启动",
            Constraints = new() { "需 control 权限", "无风机过载信号" } },
        new() { Key = "baf.blower.stop", Label = "曝气风机停止", Device = "B-201 曝气风机", UnitCode = "baf", Risk = "warning", NeedsConfirm = true,
            Desc = "停止曝气，DO 将快速下降。", Interlock = "仅手动检修使用，停止 30 min 内需恢复",
            Constraints = new() { "需 control 权限", "确认非反冲洗进行中" } },
        new() { Key = "baf.backwash", Label = "固液分离反冲", Device = "P-202 / V-203", UnitCode = "baf", Risk = "warning", NeedsConfirm = true,
            Desc = "按「气冲 → 气水联合 → 漂洗」执行一次反冲洗。", Interlock = "反冲洗期间暂停进水 8 min",
            Constraints = new() { "需 control 权限", "当前不在反冲洗阶段", "清水池液位 ≥ 30%" } },
        new() { Key = "sulfur.backwash", Label = "自养脱氮反冲洗", Device = "P-501 / V-502", UnitCode = "sulfur", Risk = "warning", NeedsConfirm = true,
            Desc = "对自养脱氮滤池执行一次反冲洗。", Interlock = "反冲洗期间暂停进水 8 min",
            Constraints = new() { "需 control 权限", "当前不在反冲洗阶段" } },
        new() { Key = "pac.pump.start", Label = "PAC 加药泵启动", Device = "P-301 加药泵", UnitCode = "pac", Risk = "normal",
            Desc = "启动 PAC 计量泵。", Interlock = "药箱余量 ≥ 10%", Constraints = new() { "需 control 权限", "药箱余量 ≥ 10%" } },
        new() { Key = "pac.pump.stop", Label = "PAC 加药泵停止", Device = "P-301 加药泵", UnitCode = "pac", Risk = "normal",
            Desc = "停止 PAC 投加。", Interlock = "无", Constraints = new() { "需 control 权限" } },
        new() { Key = "pam.pump.start", Label = "PAM 加药泵启动", Device = "P-401 加药泵", UnitCode = "pam", Risk = "normal",
            Desc = "启动 PAM 计量泵。", Interlock = "药箱余量 ≥ 10%", Constraints = new() { "需 control 权限", "药箱余量 ≥ 10%" } },
        new() { Key = "pam.pump.stop", Label = "PAM 加药泵停止", Device = "P-401 加药泵", UnitCode = "pam", Risk = "normal",
            Desc = "停止 PAM 投加。", Interlock = "无", Constraints = new() { "需 control 权限" } },
        new() { Key = "waste.drain", Label = "废水箱排空", Device = "废水箱排空阀", UnitCode = "waste", Risk = "normal",
            Desc = "开启排空阀，将反冲洗废水转入回用池。", Interlock = "液位 ≥ 15%",
            Constraints = new() { "需 control 权限", "液位 ≥ 15%" } },
        new() { Key = "alarm.reset", Label = "报警复位", Device = "PLC-1", UnitCode = "plant", Risk = "normal",
            Desc = "清除已恢复的告警锁存，不改变设备状态。", Interlock = "仅对已恢复告警有效",
            Constraints = new() { "需 control 权限", "确认现场无遗留异常" } },
    };

    public static List<LabMetricDef> LabMetrics() => new()
    {
        new() { Key = "COD", Name = "COD", Unit = "mg/L", Digits = 1 },
        new() { Key = "NH3N", Name = "氨氮", Unit = "mg/L", Digits = 2 },
        new() { Key = "TN", Name = "总氮", Unit = "mg/L", Digits = 2 },
        new() { Key = "TP", Name = "总磷", Unit = "mg/L", Digits = 2 },
        new() { Key = "SS", Name = "悬浮物", Unit = "mg/L", Digits = 1 },
        new() { Key = "TURB", Name = "浊度", Unit = "NTU", Digits = 1 },
        new() { Key = "pH", Name = "pH", Unit = "", Digits = 2 },
    };

    public static List<string> LabPoints() => new() { "inlet", "baf", "outlet" };

    public static string LabPointName(string key) => key switch
    {
        "inlet" => "进水（进水调节池）",
        "baf" => "固液分离出水",
        "outlet" => "清水池出水",
        _ => key,
    };

    public static List<ReportInfo> Reports(string siteId, DateTime now) => new()
    {
        new()
        {
            Id = "RPT-" + now.ToString("yyyyMMdd") + "-D1", SiteId = siteId, Type = "daily",
            Title = "运行日报 · " + now.ToString("yyyy-MM-dd"), Status = "ready",
            CreatedAt = Ms(now.Date.AddHours(8).AddMinutes(5)), CreatedBy = "系统自动",
            RangeText = now.Date.ToString("yyyy-MM-dd") + " 00:00 — 24:00",
            Sections = new List<ReportSection>
            {
                new() { Title = "水量与能耗", Rows = new() { new("处理水量", "2.31 m³"), new("吨水电耗", "2.42 kWh/m³"), new("吨水药耗", "PAC 1.8 L/h · PAM 1.2 L/h") } },
                new() { Title = "水质", Rows = new() { new("出水 COD", "18.6 mg/L"), new("出水氨氮", "0.42 mg/L"), new("出水总磷", "0.28 mg/L") } },
                new() { Title = "运行事件", Rows = new() { new("活动告警", "3 条"), new("完成工单", "1 单"), new("反冲洗", "固液分离 2 次 / 自养脱氮 1 次") } },
            },
        },
        new()
        {
            Id = "RPT-" + now.AddDays(-1).ToString("yyyyMMdd") + "-D1", SiteId = siteId, Type = "daily",
            Title = "运行日报 · " + now.AddDays(-1).ToString("yyyy-MM-dd"), Status = "ready",
            CreatedAt = Ms(now.Date.AddDays(-1).AddHours(8)), CreatedBy = "系统自动",
            RangeText = now.AddDays(-1).ToString("yyyy-MM-dd") + " 00:00 — 24:00",
            Sections = new List<ReportSection>
            {
                new() { Title = "水量与能耗", Rows = new() { new("处理水量", "2.28 m³"), new("吨水电耗", "2.39 kWh/m³") } },
                new() { Title = "水质", Rows = new() { new("出水 COD", "19.2 mg/L"), new("出水氨氮", "0.48 mg/L") } },
            },
        },
        new()
        {
            Id = "RPT-" + now.ToString("yyyyMM") + "-W4", SiteId = siteId, Type = "weekly",
            Title = "运行周报 · 第 " + ((now.Day - 1) / 7 + 1) + " 周", Status = "draft",
            CreatedAt = Ms(now.Date.AddDays(-2).AddHours(17)), CreatedBy = "王敏",
            RangeText = now.AddDays(-7).ToString("MM-dd") + " — " + now.ToString("MM-dd"),
            Sections = new List<ReportSection>
            {
                new() { Title = "汇总", Rows = new() { new("处理水量", "16.1 m³"), new("达标率", "100%"), new("告警总数", "9 条") } },
            },
        },
    };

    public static List<KeyValuePair<string, string>> Settings(string siteId) => new()
    {
        new("site.name", "安吉·鲁家村示范站"),
        new("site.mode", "自动运行"),
        new("alarm.push", "开启"),
        new("alarm.quiet", "22:00–07:00 仅紧急"),
        new("sample.interval", "10 s"),
        new("upload.interval", "60 s"),
        new("report.auto", "每日 08:05 生成日报"),
        new("retention.alarm", "180 天"),
        new("retention.telemetry", "365 天"),
        new("backup.auto", "每日 02:00，保留 30 份"),
        new("kiosk.auto", "空闲 3 min 返回首页"),
        new("quality.standard", "一级 A（COD ≤ 50 / NH3-N ≤ 5）"),
    };

    public static List<ChannelInfo> Channels() => new()
    {
        new() { Id = "ch-sms", Name = "短信通知", Type = "sms", Enabled = true, Target = "值班手机 138****1136", LastTestAt = "2026-10-26 09:12", LastResult = "成功" },
        new() { Id = "ch-wecom", Name = "企业微信机器人", Type = "wecom", Enabled = true, Target = "运维群 / 告警机器人", LastTestAt = "2026-10-26 09:12", LastResult = "成功" },
        new() { Id = "ch-email", Name = "邮件日报", Type = "email", Enabled = false, Target = "ops@xiaoyu.example", LastTestAt = "2026-10-24 18:00", LastResult = "未启用" },
        new() { Id = "ch-webhook", Name = "上级平台推送", Type = "http", Enabled = true, Target = "https://gov.example/api/water/report", LastTestAt = "2026-10-25 22:30", LastResult = "成功" },
    };
}
