const fs = require('fs');
const root = 'D:/小禹/native/ZhifuWater.Desktop/';
function load(rel) {
  const raw = fs.readFileSync(root + rel);
  const bom = raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF;
  let s = raw.toString('utf8'); if (bom) s = s.slice(1);
  const crlf = s.includes('\r\n');
  return { rel, bom, crlf, s: s.replace(/\r\n/g, '\n') };
}
function save(f) { let s = f.s; if (f.crlf) s = s.replace(/\n/g, '\r\n'); fs.writeFileSync(root + f.rel, (f.bom ? '\uFEFF' : '') + s, 'utf8'); }
function rep(f, a, b) { if (f.s.split(a).length !== 2) throw new Error(f.rel + ' x' + (f.s.split(a).length - 1) + ': ' + a.slice(0, 60)); f.s = f.s.replace(a, b); }
function ensure(f, a, b) { if (f.s.includes(b)) return; rep(f, a, a + b); }

// A) Styles: 删除重复的 CaptionButton 块（第二次出现）
const styles = load('Styles.xaml');
const marker = '    <Style x:Key="CaptionButton" TargetType="Button">';
const first = styles.s.indexOf(marker);
const second = styles.s.indexOf(marker, first + marker.length);
if (second > 0) {
  const after = styles.s.indexOf('    <Style x:Key="IconButton"', second);
  if (after < 0) throw new Error('caption block end not found');
  styles.s = styles.s.slice(0, second) + styles.s.slice(after);
  save(styles);
  console.log('duplicate CaptionButton removed');
}

// B) 主窗代码：启用无边框 + 窗口按钮事件
const mainCs = load('Windows/MainWindow.xaml.cs');
if (!mainCs.s.includes('using System.Windows.Input;')) rep(mainCs, 'using System.Windows.Controls;\n', 'using System.Windows.Controls;\nusing System.Windows.Controls.Primitives;\nusing System.Windows.Input;\n');
ensure(mainCs, '            InitializeComponent();\n', '            NativeChrome.EnableCustomFrame(this);\n');
if (!mainCs.s.includes('OnTopBarMouseDown')) {
  rep(mainCs, '        private void OnRefreshClick(object sender, RoutedEventArgs e)',
`        private void OnTopBarMouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.OriginalSource is DependencyObject d && HasInteractiveParent(d)) return;
            if (e.ClickCount == 2) { ToggleMaximize(); return; }
            if (e.ButtonState == MouseButtonState.Pressed)
            {
                try { DragMove(); } catch (InvalidOperationException) { }
            }
        }

        private static bool HasInteractiveParent(DependencyObject d)
        {
            for (var cur = d; cur is not null; cur = VisualTreeHelper.GetParent(cur))
            {
                if (cur is ButtonBase or ComboBox or TextBox) return true;
            }
            return false;
        }

        private void OnMinimizeClick(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;

        private void OnMaximizeClick(object sender, RoutedEventArgs e) => ToggleMaximize();

        private void ToggleMaximize()
        {
            WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
            if (MaxGlyph is not null)
                MaxGlyph.Text = WindowState == WindowState.Maximized ? "\\uE923" : "\\uE922";
        }

        private void OnCloseClick(object sender, RoutedEventArgs e) => Close();

        private void OnRefreshClick(object sender, RoutedEventArgs e)`);
}
save(mainCs);

// C) 登录窗：无系统标题栏 + 关闭按钮 + 拖动
const login = load('Windows/LoginWindow.xaml');
if (!login.s.includes('WindowStyle="None"')) rep(login, '        WindowStartupLocation="CenterScreen"', '        WindowStartupLocation="CenterScreen"\n        WindowStyle="None" ResizeMode="NoResize"');
if (!login.s.includes('OnShellMouseDown')) rep(login, '    <Grid>\n        <Grid.ColumnDefinitions>', '    <Grid MouseLeftButtonDown="OnShellMouseDown">\n        <Grid.ColumnDefinitions>');
if (!login.s.includes('CaptionCloseButton')) {
  rep(login, '    </Grid>\n</Window>', `        <Button Style="{DynamicResource CaptionCloseButton}" HorizontalAlignment="Right" VerticalAlignment="Top"
                Margin="0,8,8,0" Click="OnCloseClick" ToolTip="关闭" Panel.ZIndex="10">
            <TextBlock Text="&#xE8BB;" FontFamily="Segoe MDL2 Assets" FontSize="10" Foreground="{DynamicResource Ink2}" />
        </Button>
    </Grid>
</Window>`);
}
save(login);

const loginCs = load('Windows/LoginWindow.xaml.cs');
if (!loginCs.s.includes('using System.Windows.Media;')) rep(loginCs, 'using System.Windows.Input;\n', 'using System.Windows.Controls.Primitives;\nusing System.Windows.Input;\nusing System.Windows.Media;\n');
ensure(loginCs, '            InitializeComponent();\n', '            NativeChrome.EnableCustomFrame(this);\n');
if (!loginCs.s.includes('OnShellMouseDown')) {
  rep(loginCs, '        private void OnFillClick', `        private void OnShellMouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.OriginalSource is DependencyObject d && HasInteractiveParent(d)) return;
            if (e.ButtonState == MouseButtonState.Pressed)
            {
                try { DragMove(); } catch (InvalidOperationException) { }
            }
        }

        private static bool HasInteractiveParent(DependencyObject d)
        {
            for (var cur = d; cur is not null; cur = VisualTreeHelper.GetParent(cur))
            {
                if (cur is ButtonBase or TextBox) return true;
            }
            return false;
        }

        private void OnCloseClick(object sender, RoutedEventArgs e) => Close();

        private void OnFillClick`);
}
save(loginCs);

// D) 页面滚动条彻底隐藏（DataGrid 自带的仍可用）
const kit = load('Ui/UiKit.cs');
if (kit.s.includes('VerticalScrollBarVisibility = ScrollBarVisibility.Auto,')) {
  rep(kit, '            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,', '            VerticalScrollBarVisibility = ScrollBarVisibility.Hidden,');
  save(kit);
  console.log('page scrollbar hidden');
}

console.log('chrome cleanup ok');
