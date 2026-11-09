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

// csproj：图片嵌入程序集
const proj = load('ZhifuWater.Desktop.csproj');
rep(proj, `  <Content Include="..\\seed\\db.json" Link="seed\\db.json" CopyToOutputDirectory="PreserveNewest" CopyToPublishDirectory="PreserveNewest" />`,
`  <Content Include="..\\seed\\db.json" Link="seed\\db.json" CopyToOutputDirectory="PreserveNewest" CopyToPublishDirectory="PreserveNewest" />
  <Resource Include="Assets\\*.jpg" />`);
save(proj);

// 登录页：照片背景 + 深青蒙层
const login = load('Windows/LoginWindow.xaml');
rep(login, `        <!-- 品牌侧 -->
        <Grid Grid.Column="0" ClipToBounds="True">
            <Grid.Background>`,
`        <!-- 品牌侧 -->
        <Grid Grid.Column="0" ClipToBounds="True">
            <Image Source="pack://application:,,,/Assets/site-plant.jpg" Stretch="UniformToFill" Opacity="0.9" />
            <Border>
                <Border.Background>
                    <LinearGradientBrush StartPoint="0,0" EndPoint="1,1">
                        <GradientStop Color="#B806252A" Offset="0" />
                        <GradientStop Color="#D90A3638" Offset="0.55" />
                        <GradientStop Color="#F00D4743" Offset="1" />
                    </LinearGradientBrush>
                </Border.Background>
            </Border>
            <Grid.Background>`);
save(login);

// 驾驶舱：站点条缩略图
const dash = load('Pages/DashboardPage.cs');
rep(dash, `using System.Windows.Media;`, `using System.Windows.Media;
using System.Windows.Media.Imaging;`);
rep(dash, `        var site = Svc.Data.Site;
        var left = new StackPanel();
        left.Children.Add(Kit.Row(8,
            Kit.T(site.Name, 15, Pal.Ink, bold: true),
            Kit.Badge(Pal.SiteStatusText(site.Status), "good"),
            Kit.Badge(site.Id, "muted")));
        left.Children.Add(Kit.T($"{site.Process} · 设计规模 {site.Capacity} · 投运 {site.CommissionedAt} · {site.Address}",
            11, Pal.Muted, wrap: TextWrapping.Wrap));`,
`        var site = Svc.Data.Site;
        var text = new StackPanel();
        text.Children.Add(Kit.Row(8,
            Kit.T(site.Name, 15, Pal.Ink, bold: true),
            Kit.Badge(Pal.SiteStatusText(site.Status), "good"),
            Kit.Badge(site.Id, "muted")));
        text.Children.Add(Kit.T($"{site.Process} · 设计规模 {site.Capacity} · 投运 {site.CommissionedAt} · {site.Address}",
            11, Pal.Muted, wrap: TextWrapping.Wrap));

        var thumb = new Border
        {
            Width = 76,
            Height = 48,
            CornerRadius = new CornerRadius(2),
            Margin = new Thickness(0, 0, 12, 0),
            VerticalAlignment = VerticalAlignment.Center,
            Background = new ImageBrush(new BitmapImage(new Uri("pack://application:,,,/Assets/tanks-aerial.jpg")))
            {
                Stretch = Stretch.UniformToFill,
            },
        };
        var left = new StackPanel { Orientation = Orientation.Horizontal };
        left.Children.Add(thumb);
        left.Children.Add(text);`);
save(dash);
console.log('image integration ok');
