const fs = require('fs');
const p = 'D:/小禹/native/ZhifuWater.Core/Simulator.cs';
let raw = fs.readFileSync(p, 'utf8');
const crlf = raw.includes('\r\n');
let s = raw.replace(/\r\n/g, '\n');

const oldLvl = `            case "RAW.LVL":
            {
                // 调节池：提升泵开 62%→28% 排空（约 70 分钟），泵停后进水回填 28%→62%（约 25 分钟）
                double period = 240 * 60000.0;
                double phase = ((t % period) + period) % period / period;
                double cycle = phase < 0.62
                    ? 64 - 36 * (phase / 0.62)
                    : 28 + 36 * ((phase - 0.62) / 0.38);
                double v = JsMath.Clamp(cycle + noise * 1.0, 21, 70);
                return JsMath.Round(BlendToCurrent(v, st.Raw.Level, ago, 25), 1);
            }
            case "RAW.PUMP.RUN":
            {
                double period = 240 * 60000.0;
                double phase = ((t % period) + period) % period / period;
                return phase < 0.62 ? 1 : 0;
            }`;

const newLvl = `            case "RAW.LVL":
            {
                // 调节池：泵开排空、泵停回填；周期与幅度缓慢漂移，避免每小时重复同一锯齿
                double f = RawCyclePhase(t);
                double hours = t / 3600000.0;
                double mid = 45 + 7 * Math.Sin(hours / 26.0) + 2.5 * Math.Sin(hours / 5.3);
                double amp = 16 + 5 * Math.Sin(hours / 11.0) + 2 * Math.Sin(hours / 2.7);
                double shape = f < 0.62
                    ? 1 - 2 * (f / 0.62)
                    : -1 + 2 * ((f - 0.62) / 0.38);
                double v = JsMath.Clamp(mid + amp * shape + noise * 0.7, 20, 70);
                return JsMath.Round(BlendToCurrent(v, st.Raw.Level, ago, 25), 1);
            }
            case "RAW.PUMP.RUN": return RawCyclePhase(t) < 0.62 ? 1 : 0;`;

if (!s.includes(oldLvl)) { console.log('level block missing'); process.exit(1); }
s = s.replace(oldLvl, newLvl);

const anchor = `    /// <summary>历史曲线：以当前状态为锚的解析序列，事件窗口用于让种子告警在曲线上可解释。</summary>`;
const helper = `    /// <summary>调节池进出水节律：周期本身缓慢变化，回填曲线不再是等幅等周期的锯齿。</summary>
    private static double RawCyclePhase(long t)
    {
        double hours = t / 3600000.0;
        double phase = hours / 4.0 + 0.85 * Math.Sin(hours / 9.0) + 0.33 * Math.Sin(hours / 3.1);
        return phase - Math.Floor(phase);
    }

` + anchor;
if (!s.includes(anchor)) { console.log('anchor missing'); process.exit(1); }
if (!s.includes('RawCyclePhase')) { s = s.replace(anchor, helper); }

if (crlf) s = s.replace(/\n/g, '\r\n');
fs.writeFileSync(p, s, 'utf8');
console.log('raw level history now irregular');
