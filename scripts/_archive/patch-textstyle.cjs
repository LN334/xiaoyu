const fs = require('fs');

function ed(p, subs) {
  let raw = fs.readFileSync(p);
  const bom = raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF;
  let s = raw.toString('utf8');
  if (bom) s = s.slice(1);
  const crlf = s.includes('\r\n');
  s = s.replace(/\r\n/g, '\n');
  for (const [a, b] of subs) {
    if (s.split(a).length !== 2) throw new Error('anchor in ' + p + ': ' + a.slice(0, 50));
    s = s.replace(a, b);
  }
  if (crlf) s = s.replace(/\n/g, '\r\n');
  fs.writeFileSync(p, (bom ? '\uFEFF' : '') + s, 'utf8');
  console.log('ok', p);
}

const root = 'D:/小禹/native/ZhifuWater.Desktop/';

ed(root + 'Styles.xaml', [[
`    <Style TargetType="TextBlock">
        <Setter Property="FontFamily" Value="{StaticResource UiFont}" />
        <Setter Property="FontSize" Value="13" />
        <Setter Property="Foreground" Value="{StaticResource Ink2}" />
        <Setter Property="TextOptions.TextFormattingMode" Value="Display" />
        <Setter Property="TextWrapping" Value="NoWrap" />
    </Style>`,
`    <Style TargetType="TextBlock">
        <Setter Property="TextOptions.TextFormattingMode" Value="Display" />
        <Setter Property="TextWrapping" Value="NoWrap" />
    </Style>`]]);

ed(root + 'Windows/MainWindow.xaml', [[
`        FontFamily="{DynamicResource UiFont}"`,
`        FontFamily="{DynamicResource UiFont}"
        Foreground="{DynamicResource Ink2}"`]]);

ed(root + 'Windows/LoginWindow.xaml', [[
`        FontFamily="{DynamicResource UiFont}"`,
`        FontFamily="{DynamicResource UiFont}"
        Foreground="{DynamicResource Ink2}"`]]);
