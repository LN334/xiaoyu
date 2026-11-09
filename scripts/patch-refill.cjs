const fs = require('fs');
const base = 'D:/小禹/native/ZhifuWater.Core/';
function load(rel) {
  const raw = fs.readFileSync(base + rel);
  const bom = raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF;
  let s = raw.toString('utf8'); if (bom) s = s.slice(1);
  const crlf = s.includes('\r\n');
  return { rel, bom, crlf, s: s.replace(/\r\n/g, '\n') };
}
function save(f) { let s = f.s; if (f.crlf) s = s.replace(/\n/g, '\r\n'); fs.writeFileSync(base + f.rel, (f.bom ? '\uFEFF' : '') + s, 'utf8'); }
function rep(f, a, b) { if (f.s.split(a).length !== 2) throw new Error(f.rel + ' x' + (f.s.split(a).length - 1) + ': ' + a.slice(0, 60)); f.s = f.s.replace(a, b); }

// 1) 实时水力：连续进水 + 补水 + 泵排水，液位可见地上下循环
const sim = load('Simulator.cs');
rep(sim, `        bool wasRun = r.PumpRun;
        if (r.PumpRun) r.Level -= 0.012 * dt;
        // 补水阀：低液位自动补水，到 70% 关闭
        if (r.Level < 25) r.Refill = true;
        if (r.Refill && r.Level >= 70) r.Refill = false;
        if (r.Refill && !r.PumpRun) r.Level += 0.03 * dt;
        if (r.Level <= 20 && r.PumpRun)
        {
            r.PumpRun = false;
            r.Trip = now;
        }
        if (!r.PumpRun && !r.Refill && r.Level >= 30 && r.PumpMode == 0 && !r.Fault) r.PumpRun = true;`,
`        bool wasRun = r.PumpRun;
        // 连续进水：来水一直进调节池，泵与补水阀决定液位方向
        r.Level += 0.004 * dt;
        if (r.PumpRun) r.Level -= 0.022 * dt;
        if (r.Refill) r.Level += 0.020 * dt;
        // 补水阀滞环：低液位开、高液位关（自动化规则也会下发同名命令，写执行记录）
        if (r.Level <= 32) r.Refill = true;
        if (r.Refill && r.Level >= 64) r.Refill = false;
        if (r.Level <= 28 && r.PumpRun)
        {
            r.PumpRun = false;
            r.Trip = now;
        }
        if (!r.PumpRun && r.Level >= 58 && r.PumpMode == 0 && !r.Fault)
        {
            r.PumpRun = true;
            r.Refill = false;
        }`);
rep(sim, `            case "raw.pump.stop": s.Raw.PumpRun = false; break;
            case "raw.pump.mode.set": s.Raw.PumpMode = (int)(J.Num(args, "mode") ?? 0); break;`,
`            case "raw.pump.stop": s.Raw.PumpRun = false; break;
            case "raw.refill.start": s.Raw.Refill = true; break;
            case "raw.refill.stop": s.Raw.Refill = false; break;
            case "raw.pump.mode.set": s.Raw.PumpMode = (int)(J.Num(args, "mode") ?? 0); break;`);
rep(sim, `            case "raw.pump.stop":
                return Ok();`,
`            case "raw.pump.stop":
                return Ok();
            case "raw.refill.start":
                if (s.Raw.Level >= 92) return Fail("进水调节池液位已超过 92%，禁止开启补水阀");
                return Ok();
            case "raw.refill.stop":
                return Ok();`);
save(sim);

// 2) 命令目录：补水阀开关
const cmd = load('CommandEngine.cs');
rep(cmd, `        ["raw.pump.mode.set"] = new("切换提升泵运行模式", "raw-pump", "high", 1000, "运行模式切换"),`,
`        ["raw.pump.mode.set"] = new("切换提升泵运行模式", "raw-pump", "high", 1000, "运行模式切换"),
        ["raw.refill.start"] = new("开启进水调节池补水阀", "raw-refill", "medium", 1000, "补水阀开启"),
        ["raw.refill.stop"] = new("关闭进水调节池补水阀", "raw-refill", "medium", 1000, "补水阀关闭"),`);
save(cmd);

// 3) 自动化：低液位自动补水、高液位停补水
const auto = load('AutomationService.cs');
rep(auto, `        yield return Rule("auto-pac-stop", "PAC 药箱低液位自动停加药", "dosing", "pac",`,
`        yield return Rule("auto-raw-refill", "低液位自动补水", "pump", "raw",
            new[] { Cond("RAW.LVL", "<=", 32) }, holdSec: 20, cooldownSec: 600, maxPerDay: 8,
            action: "command", command: "raw.refill.start",
            reason: "进水调节池液位低于 32%，自动开启补水阀");

        yield return Rule("auto-raw-refill-stop", "高液位自动停补水", "pump", "raw",
            new[] { Cond("RAW.LVL", ">=", 62) }, holdSec: 20, cooldownSec: 600, maxPerDay: 8,
            action: "command", command: "raw.refill.stop",
            reason: "进水调节池液位高于 62%，自动关闭补水阀");

        yield return Rule("auto-pac-stop", "PAC 药箱低液位自动停加药", "dosing", "pac",`);
save(auto);
console.log('refill automation ok');
