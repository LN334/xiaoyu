const fs = require('fs');
const simPath = 'native/ZhifuWater.Core/Simulator.cs';
let s = fs.readFileSync(simPath, 'utf8');

const oldRaw = [
  '        // 连续进水：来水一直进调节池，泵与补水阀决定液位方向',
  '        r.Level += 0.006 * dt;',
  '        if (r.PumpRun) r.Level -= 0.050 * dt;',
  '        if (r.Refill) r.Level += 0.060 * dt;'
].join('\n');

const newRaw = [
  '        // 连续进水：来水一直进调节池，泵与补水阀决定液位方向。',
  '        // 按“池容 + 流量”积分：0.6 m³ 调节池、100 L/h 设计进水、',
  '        // 补水 0.36 m³/h、提升泵 0.16 m³/h；DemoSpeed 只用于让演示时变化可见。',
  '        const double RawVolumeM3 = 0.60, DesignFlowM3h = 0.10, RefillFlowM3h = 0.36, PumpFlowM3h = 0.16, DemoSpeed = 15;',
  '        double netFlowM3h = DesignFlowM3h + (r.Refill ? RefillFlowM3h : 0) - (r.PumpRun ? PumpFlowM3h : 0);',
  '        r.Level += netFlowM3h / RawVolumeM3 / 3600.0 * 100.0 * dt * DemoSpeed;'
].join('\n');

if (!s.includes(oldRaw)) { console.error('raw anchor missing'); process.exit(1); }
s = s.replace(oldRaw, newRaw);

const oldClear = '        s.ClearLevel = JsMath.Clamp(s.ClearLevel + (s.Raw.PumpRun ? 0.004 : -0.002) * dt, 0, 100);';
const newClear = [
  '        const double ClearVolumeM3 = 0.40, PumpOutM3h = 0.16, TreatedOutM3h = 0.10;',
  '        double clearNet = s.Raw.PumpRun ? (PumpOutM3h - TreatedOutM3h) : -TreatedOutM3h;',
  '        s.ClearLevel = JsMath.Clamp(s.ClearLevel + clearNet / ClearVolumeM3 / 3600.0 * 100.0 * dt * 15, 0, 100);'
].join('\n');

if (!s.includes(oldClear)) { console.error('clear anchor missing'); process.exit(1); }
s = s.replace(oldClear, newClear);
fs.writeFileSync(simPath, s, 'utf8');
console.log('simulator patched');

const mainPath = 'native/ZhifuWater.Desktop/Windows/MainWindow.xaml.cs';
let m = fs.readFileSync(mainPath, 'utf8');
m = m.replace('            _services.Data.Tick();\n', '');
fs.writeFileSync(mainPath, m, 'utf8');
console.log('auto refresh tick removed');
