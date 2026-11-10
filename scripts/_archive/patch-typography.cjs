const fs = require('fs');
const path = require('path');

function load(p) {
  const raw = fs.readFileSync(p, 'utf8');
  const bom = raw.charCodeAt(0) === 0xfeff;
  return { text: raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'), bom };
}
function save(p, text, bom) {
  fs.writeFileSync(p, (bom ? '\uFEFF' : '') + text.replace(/\n/g, '\r\n'), 'utf8');
}

// 1) Chinese-first UI font + integer type scale
const styles = 'native/ZhifuWater.Desktop/Styles.xaml';
const st = load(styles);
st.text = st.text.replace('<FontFamily x:Key="UiFont">Segoe UI, Microsoft YaHei UI</FontFamily>',
                          '<FontFamily x:Key="UiFont">Microsoft YaHei UI, Segoe UI</FontFamily>');
st.text = st.text.replace(/(<Setter Property="FontSize" Value=")(12\.5|13\.5|10\.5)(")/g,
  (m, a, v, b) => a + ({ '12.5': '13', '13.5': '14', '10.5': '11' })[v] + b);
save(styles, st.text, st.bom);
console.log('styles ok');

// 2) round fractional sizes across Desktop C#
const dir = 'native/ZhifuWater.Desktop';
const map = { '10.5': '11', '11.5': '12', '12.5': '13', '13.5': '14' };
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!['bin', 'obj'].includes(e.name)) walk(p); continue; }
    if (!e.name.endsWith('.cs')) continue;
    const f = load(p);
    let t = f.text.replace(/\b(10\.5|11\.5|12\.5|13\.5)\b/g, (m) => map[m]);
    if (t !== f.text) { save(p, t, f.bom); console.log('sizes', p); }
  }
}
walk(dir);

// 3) baseline-aligned value + unit in KPI (single TextBlock with Runs)
const kit = 'native/ZhifuWater.Desktop/Ui/UiKit.cs';
const k = load(kit);
const marker = '    public static Border Kpi(KpiInfo kpi, double minWidth = 0)';
if (!k.text.includes(marker)) throw new Error('Kpi marker missing');
const helper = `    public static TextBlock ValueWithUnit(string value, string unit, double valueSize = 20, double unitSize = 11)
    {
        var tb = new TextBlock
        {
            FontFamily = (System.Windows.Media.FontFamily)Application.Current.Resources["UiFont"],
            TextOptions.TextFormattingMode = TextFormattingMode.Display,
        };
        tb.Inlines.Add(new Run(value) { FontSize = valueSize, FontWeight = FontWeights.SemiBold, Foreground = Pal.Ink });
        if (!string.IsNullOrEmpty(unit))
            tb.Inlines.Add(new Run(" " + unit) { FontSize = unitSize, FontWeight = FontWeights.Normal, Foreground = Pal.Muted });
        return tb;
    }

`;
k.text = k.text.replace(marker, helper + marker);

const kpiOld = `        var valueRow = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 2, 0, 0) };
        valueRow.Children.Add(KpiValueText(kpi.Value));
        if (!string.IsNullOrEmpty(kpi.Unit))
            valueRow.Children.Add(new TextBlock { Text = " " + kpi.Unit, FontSize = 11, Foreground = Pal.Muted, VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(0, 0, 0, 3) });
        stack.Children.Add(valueRow);`;
const kpiNew = `        var valueRow = ValueWithUnit(kpi.Value, kpi.Unit);
        valueRow.Margin = new Thickness(0, 2, 0, 0);
        stack.Children.Add(valueRow);`;
if (k.text.split(kpiOld).length !== 2) throw new Error('KpiCell block count ' + k.text.split(kpiOld).length);
k.text = k.text.replace(kpiOld, kpiNew);

const kpiCellOld = `        var valueRow = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 2, 0, 0) };
        valueRow.Children.Add(KpiValueText(kpi.Value));
        if (!string.IsNullOrEmpty(kpi.Unit))
            valueRow.Children.Add(new TextBlock { Text = " " + kpi.Unit, FontSize = 11, Foreground = Pal.Muted, VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(0, 0, 0, 3) });
        stack.Children.Add(valueRow);`;
// KpiCell uses the same block; both were replaced by the previous replace if identical count 2.
if (k.text.includes(kpiCellOld)) {
  k.text = k.text.split(kpiCellOld).join(kpiNew);
}
save(kit, k.text, k.bom);
console.log('kit ok');
