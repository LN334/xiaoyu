const fs = require('fs');
const path = require('path');
const root = 'D:/小禹/native/ZhifuWater.Desktop';

function edit(rel, fn) {
  const p = path.join(root, rel);
  let raw = fs.readFileSync(p);
  const bom = raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF;
  let s = raw.toString('utf8');
  if (bom) s = s.slice(1);
  const crlf = s.includes('\r\n');
  s = s.replace(/\r\n/g, '\n');
  const before = s;
  s = fn(s);
  if (s === before) throw new Error('no change: ' + rel);
  if (crlf) s = s.replace(/\n/g, '\r\n');
  fs.writeFileSync(p, (bom ? '\uFEFF' : '') + s, 'utf8');
  console.log('patched', rel);
}

const rep = (a, b) => s => {
  if (s.split(a).length !== 2) throw new Error('anchor x' + (s.split(a).length - 1) + ': ' + a.slice(0, 60));
  return s.replace(a, b);
};

// 1. brand palette: blue -> water teal
for (const rel of ['Styles.xaml', 'Ui/Pal.cs', 'Ui/Charts.cs', 'Data/CoreDesktopData.cs', 'Data/DemoDesktopData.cs', 'Data/DemoDesktopData.Content.cs', 'Data/Models.cs', 'Pages/DashboardPage.cs', 'Windows/LoginWindow.xaml']) {
  const p = path.join(root, rel);
  let s = fs.readFileSync(p, 'utf8');
  const n = s.replace(/#0B6BB5/g, '#0E7C74').replace(/#085291/g, '#0B645D').replace(/#E9F2FA/g, '#E7F3F1').replace(/#101A20/g, '#0B2427').replace(/#1B2C36/g, '#123A3C').replace(/#A9BCC4/g, '#A7C4C0').replace(/#6D838D/g, '#6C9A93');
  if (n !== s) { fs.writeFileSync(p, n, 'utf8'); console.log('recolored', rel); }
}

// 2. sidebar brand mark
edit('Windows/MainWindow.xaml', rep(
`                            <Border Width="26" Height="26" Background="{DynamicResource Accent}" CornerRadius="2">
                                <TextBlock Text="清" Foreground="White" FontSize="14" FontWeight="SemiBold"
                                           HorizontalAlignment="Center" VerticalAlignment="Center" />
                            </Border>`,
`                            <Grid Width="26" Height="27">
                                <Border Background="{DynamicResource Accent}" CornerRadius="3" />
                                <Path Data="M13,4 C13,4 22,14 22,20 A9,9 0 0 1 4,20 C4,14 13,4 13,4 Z"
                                      Fill="#F2FFFD" Stretch="Fill" Margin="6,4.5,6,5.5" />
                            </Grid>`));

// 3. drop redundant breadcrumb
edit('Windows/MainWindow.xaml', rep(
`                        <TextBlock x:Name="PageTitle" FontSize="13.5" FontWeight="SemiBold"
                                   Foreground="{DynamicResource Ink}" Text="综合驾驶舱" />
                        <TextBlock x:Name="PageCrumb" FontSize="10.5" Foreground="{DynamicResource Muted2}"
                                   Margin="0,1,0,0" Text="总览 / 综合驾驶舱" />`,
`                        <TextBlock x:Name="PageTitle" FontSize="14" FontWeight="SemiBold"
                                   Foreground="{DynamicResource Ink}" Text="综合驾驶舱" />`));

// 4. sidebar footer: version only
edit('Windows/MainWindow.xaml', rep(
`                <Border DockPanel.Dock="Bottom" Padding="12,7,12,9">
                    <StackPanel>
                        <TextBlock x:Name="SidebarSource" FontSize="9.5" Foreground="#7E939D" TextWrapping="Wrap" />
                        <TextBlock Text="v2.0.8" FontSize="9.5" Foreground="#5D727B" Margin="0,2,0,0" />
                    </StackPanel>
                </Border>`,
`                <Border DockPanel.Dock="Bottom" Padding="14,7,12,10">
                    <TextBlock Text="v2.0.8" FontSize="10" Foreground="#6C9A93" />
                </Border>`));

// 5. status bar: running dot + last update
edit('Windows/MainWindow.xaml', rep(
`                <Grid Margin="14,0,12,0">
                    <TextBlock x:Name="FooterSource" FontSize="10" Foreground="{DynamicResource Muted2}"
                               VerticalAlignment="Center" Text="本机业务层" />
                    <TextBlock x:Name="FooterRight" FontSize="10" Foreground="{DynamicResource Muted2}"
                               VerticalAlignment="Center" HorizontalAlignment="Right" Text="最后更新 —" />
                </Grid>`,
`                <Grid Margin="16,0,14,0">
                    <StackPanel Orientation="Horizontal" VerticalAlignment="Center">
                        <Ellipse Width="6" Height="6" Fill="{DynamicResource Good}" VerticalAlignment="Center" />
                        <TextBlock x:Name="FooterSource" FontSize="10" Foreground="{DynamicResource Muted2}"
                                   Margin="6,0,0,0" VerticalAlignment="Center" Text="运行正常" />
                    </StackPanel>
                    <TextBlock x:Name="FooterRight" FontSize="10" Foreground="{DynamicResource Muted2}"
                               VerticalAlignment="Center" HorizontalAlignment="Right" Text="最后更新 —" />
                </Grid>`));

// 6. dashboard: drop note + health explainer, tighten paddings
edit('Pages/DashboardPage.cs', s => {
  s = rep(`        left.Children.Add(Kit.T(site.Note, 11, Pal.Muted2, wrap: TextWrapping.Wrap));\n`, '')(s);
  s = rep(`        health.Children.Add(Kit.T("网关 / 点位在线率 / 最新采集", 10, Pal.Muted2));\n`, '')(s);
  s = rep(`            Padding = new Thickness(12, 10, 12, 10),`, `            Padding = new Thickness(16, 12, 16, 12),`)(s);
  s = rep(`new Thickness(0, 10, 0, 0)`, `new Thickness(0, 12, 0, 0)`)(s);
  return s;
});

// 7. section head / kpi cell paddings
edit('Ui/UiKit.cs', s => {
  s = rep(`Padding = new Thickness(12, 9, 12, 7)`, `Padding = new Thickness(16, 10, 16, 8)`)(s);
  return s;
});

console.log('done');
