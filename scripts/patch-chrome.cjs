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
function rep(f, a, b) { if (f.s.split(a).length !== 2) throw new Error(f.rel + ' x' + (f.s.split(a).length - 1) + ': ' + a.slice(0, 70)); f.s = f.s.replace(a, b); }

// 1) 样式：窗口按钮
const styles = load('Styles.xaml');
rep(styles, `    <Style x:Key="IconButton" TargetType="Button" BasedOn="{StaticResource BaseButton}">`,
`    <Style x:Key="CaptionButton" TargetType="Button">
        <Setter Property="Width" Value="40" />
        <Setter Property="Height" Value="30" />
        <Setter Property="Background" Value="Transparent" />
        <Setter Property="BorderThickness" Value="0" />
        <Setter Property="Cursor" Value="Hand" />
        <Setter Property="Template">
            <Setter.Value>
                <ControlTemplate TargetType="Button">
                    <Border x:Name="bg" Background="{TemplateBinding Background}" CornerRadius="3">
                        <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center" />
                    </Border>
                    <ControlTemplate.Triggers>
                        <Trigger Property="IsMouseOver" Value="True">
                            <Setter TargetName="bg" Property="Background" Value="#EEF3F4" />
                        </Trigger>
                        <Trigger Property="IsPressed" Value="True">
                            <Setter TargetName="bg" Property="Background" Value="#DCE6E9" />
                        </Trigger>
                    </ControlTemplate.Triggers>
                </ControlTemplate>
            </Setter.Value>
        </Setter>
    </Style>

    <Style x:Key="CaptionCloseButton" TargetType="Button" BasedOn="{StaticResource CaptionButton}">
        <Setter Property="Template">
            <Setter.Value>
                <ControlTemplate TargetType="Button">
                    <Border x:Name="bg" Background="{TemplateBinding Background}" CornerRadius="3">
                        <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center" />
                    </Border>
                    <ControlTemplate.Triggers>
                        <Trigger Property="IsMouseOver" Value="True">
                            <Setter TargetName="bg" Property="Background" Value="#C42B1C" />
                            <Setter Property="Foreground" Value="White" />
                        </Trigger>
                        <Trigger Property="IsPressed" Value="True">
                            <Setter TargetName="bg" Property="Background" Value="#A12216" />
                            <Setter Property="Foreground" Value="White" />
                        </Trigger>
                    </ControlTemplate.Triggers>
                </ControlTemplate>
            </Setter.Value>
        </Setter>
    </Style>

    <Style x:Key="IconButton" TargetType="Button" BasedOn="{StaticResource BaseButton}">`);
save(styles);

// 2) 主窗：无系统标题栏 + 窗口按钮
const main = load('Windows/MainWindow.xaml');
rep(main, `        WindowStartupLocation="CenterScreen"`, `        WindowStartupLocation="CenterScreen"
        WindowStyle="None" ResizeMode="CanResize"`);
rep(main, `            <Border Grid.Row="0" Background="{DynamicResource Surface}"
                    BorderBrush="{DynamicResource Line}" BorderThickness="0,0,0,1">`,
`            <Border Grid.Row="0" Background="{DynamicResource Surface}"
                    BorderBrush="{DynamicResource Line}" BorderThickness="0,0,0,1"
                    MouseLeftButtonDown="OnTopBarMouseDown">`);
rep(main, `                        <ColumnDefinition Width="Auto" />
                    </Grid.ColumnDefinitions>

                    <TextBlock x:Name="PageTitle"`,
`                        <ColumnDefinition Width="Auto" />
                        <ColumnDefinition Width="Auto" />
                    </Grid.ColumnDefinitions>

                    <TextBlock x:Name="PageTitle"`);
rep(main, `                </Grid>
            </Border>

            <ContentControl Grid.Row="1" x:Name="PageHost" />`,
`                    <StackPanel Grid.Column="7" Orientation="Horizontal" Margin="10,0,-8,0" VerticalAlignment="Center">
                        <Button Style="{DynamicResource CaptionButton}" Click="OnMinimizeClick" ToolTip="最小化">
                            <TextBlock Text="&#xE921;" FontFamily="Segoe MDL2 Assets" FontSize="10" Foreground="{DynamicResource Ink2}" />
                        </Button>
                        <Button Style="{DynamicResource CaptionButton}" Click="OnMaximizeClick" ToolTip="最大化/还原">
                            <TextBlock x:Name="MaxGlyph" Text="&#xE922;" FontFamily="Segoe MDL2 Assets" FontSize="10" Foreground="{DynamicResource Ink2}" />
                        </Button>
                        <Button Style="{DynamicResource CaptionCloseButton}" Click="OnCloseClick" ToolTip="关闭">
                            <TextBlock Text="&#xE8BB;" FontFamily="Segoe MDL2 Assets" FontSize="10" Foreground="{DynamicResource Ink2}" />
                        </Button>
                    </StackPanel>
                </Grid>
            </Border>

            <ContentControl Grid.Row="1" x:Name="PageHost" />`);
save(main);

// 3) 主窗代码：启用无边框并接按钮
const mainCs = load('Windows/MainWindow.xaml.cs');
rep(mainCs, `            InitializeComponent();`, `            InitializeComponent();
            NativeChrome.EnableCustomFrame(this);`);
rep(mainCs, `        private void OnRefreshClick(object sender, RoutedEventArgs e)`,
`        private void OnTopBarMouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.OriginalSource is DependencyObject d && HasInteractiveParent(d)) return;
            if (e.ClickCount == 2)
            {
                ToggleMaximize();
                return;
            }
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
save(mainCs);

// 4) 登录窗：无标题栏 + 关闭按钮
const login = load('Windows/LoginWindow.xaml');
rep(login, `        WindowStartupLocation="CenterScreen"`, `        WindowStartupLocation="CenterScreen"
        WindowStyle="None" ResizeMode="NoResize"`);
rep(login, `        <Grid>`, `        <Grid MouseLeftButtonDown="OnShellMouseDown">`);
rep(login, `    </Grid>
</Window>`, `        <Button Style="{DynamicResource CaptionCloseButton}" HorizontalAlignment="Right" VerticalAlignment="Top"
                Margin="0,8,8,0" Click="OnCloseClick" ToolTip="关闭" Panel.ZIndex="10">
            <TextBlock Text="&#xE8BB;" FontFamily="Segoe MDL2 Assets" FontSize="10" Foreground="{DynamicResource Ink2}" />
        </Button>
    </Grid>
</Window>`);
save(login);

const loginCs = load('Windows/LoginWindow.xaml.cs');
rep(loginCs, `            InitializeComponent();`, `            InitializeComponent();
            NativeChrome.EnableCustomFrame(this);
            PreviewKeyDown += (_, e) => { if (e.Key == Key.Escape) Close(); };`);
rep(loginCs, `        private void OnFillClick`, `        private void OnShellMouseDown(object sender, MouseButtonEventArgs e)
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
save(loginCs);

console.log('custom chrome wiring ok');
