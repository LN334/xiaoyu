using System;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using System.Collections.Generic;
using ZhifuWater.Desktop.Services;

namespace ZhifuWater.Desktop;

public partial class App : Application
{
    public static AppServices Services { get; private set; } = null!;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        ShutdownMode = ShutdownMode.OnExplicitShutdown;
        Services = AppServices.Create();
        var uiErrorShown = false;

        DispatcherUnhandledException += (_, args) =>
        {
            args.Handled = true;
            try
            {
                var dir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ZhifuWater");
                Directory.CreateDirectory(dir);
                File.AppendAllText(Path.Combine(dir, "ui-error.log"),
                    "[" + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "] " + args.Exception + Environment.NewLine + Environment.NewLine);
            }
            catch
            {
                // 写日志失败不影响提示
            }

            // 同一个界面错误只提示一次，避免刷新时反复弹窗。
            if (uiErrorShown) return;
            uiErrorShown = true;
            MessageBox.Show(
                "界面发生未处理异常：" + Environment.NewLine + args.Exception.Message
                + Environment.NewLine + Environment.NewLine + args.Exception.GetType().Name,
                "小禹 · 错误", MessageBoxButton.OK, MessageBoxImage.Error);
        };

        var smoke = e.Args.Any(a => string.Equals(a, "--smoke", StringComparison.OrdinalIgnoreCase));
        var shots = e.Args.Any(a => string.Equals(a, "--shots", StringComparison.OrdinalIgnoreCase));

        var updateCheck = e.Args.FirstOrDefault(a => a.StartsWith("--update-check=", StringComparison.OrdinalIgnoreCase));
if (updateCheck != null)
        {
            var outPath = updateCheck.Substring("--update-check=".Length);
            try
            {
                var info = System.Threading.Tasks.Task.Run(() => UpdateService.CheckAsync()).GetAwaiter().GetResult();
                var text = info == null
                    ? "{\"current\":\"" + UpdateService.CurrentVersionText + "\",\"update\":null}"
                    : "{\"current\":\"" + UpdateService.CurrentVersionText +
                      "\",\"update\":\"" + info.Version.ToString(3) +
                      "\",\"asset\":\"" + info.AssetName + "\",\"sha\":\"" + info.Sha256 + "\"}";
                System.IO.File.WriteAllText(outPath, text);
                Shutdown(0);
            }
            catch (Exception ex)
            {
                System.IO.File.WriteAllText(outPath, "{\"error\":\"" + ex.Message.Replace("\"", "'") + "\"}");
                Shutdown(2);
            }
            return;
        }

        var updateDemo = e.Args.Any(a => string.Equals(a, "--update-demo", StringComparison.OrdinalIgnoreCase));
        if (updateDemo)
        {
            try
            {
                var info = System.Threading.Tasks.Task.Run(() => UpdateService.CheckAsync()).GetAwaiter().GetResult();
                if (info != null)
                {
                    var dlg = new Windows.UpdateDialog(null, info, UpdateService.LoadSettings());
                    var shot = e.Args.FirstOrDefault(a => a.StartsWith("--shot=", StringComparison.OrdinalIgnoreCase));
                    if (shot == null)
                    {
                        dlg.ShowDialog();
                    }
                    else
                    {
                        dlg.Show();
                        var timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(900) };
                        timer.Tick += (_, _) =>
                        {
                            timer.Stop();
                            try
                            {
                                Smoke.CaptureElement(dlg, (int)dlg.ActualWidth, (int)dlg.ActualHeight,
                                    shot.Substring("--shot=".Length));
                            }
                            catch { }
                            dlg.Close();
                            Shutdown(0);
                        };
                        timer.Start();
                        return;
                    }
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "检查更新");
            }
            Shutdown(0);
            return;
        }

        var assignmentDemo = e.Args.Any(a => string.Equals(a, "--assignment-demo", StringComparison.OrdinalIgnoreCase));
        if (assignmentDemo)
        {
            var demoItem = new Data.NotificationInfo
            {
                Id = "NT-DEMO",
                Kind = "workorder",
                Title = "工单已指派：BAF 曝气风机电流偏高排查",
                Body = "高优先级 · 截止 11-04 21:30",
            };
            var dlg = new Windows.AssignmentDialog(null, demoItem, 2);
            var shot = e.Args.FirstOrDefault(a => a.StartsWith("--shot=", StringComparison.OrdinalIgnoreCase));
            if (shot == null)
            {
                dlg.ShowDialog();
            }
            else
            {
                dlg.Show();
                var timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(900) };
                timer.Tick += (_, _) =>
                {
                    timer.Stop();
                    try { Smoke.CaptureElement(dlg, (int)dlg.ActualWidth, (int)dlg.ActualHeight, shot.Substring("--shot=".Length)); }
                    catch { }
                    dlg.Close();
                    Shutdown(0);
                };
                timer.Start();
            }
            if (shot == null) Shutdown(0);
            return;
        }

        if (smoke || shots)
        {
            var code = Smoke.Run(Services, shots);
            Shutdown(code);
            return;
        }

        if (e.Args.Any(a => string.Equals(a, "--main", StringComparison.OrdinalIgnoreCase)))
        {
            var r = Services.Data.Login("admin", "water123");
            if (r.Ok && Services.Data.CurrentUser is { } u)
            {
                var w = new Windows.MainWindow(Services, u);
                Current.MainWindow = w;
                w.Show();
                var page = e.Args.FirstOrDefault(x => x.StartsWith("--page=", StringComparison.OrdinalIgnoreCase));
                if (page is not null) w.ShowPage(page.Substring("--page=".Length));
                var pageShot = e.Args.FirstOrDefault(x => x.StartsWith("--page-shot=", StringComparison.OrdinalIgnoreCase));
                if (pageShot is not null)
                {
                    var timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(1200) };
                    timer.Tick += (_, _) =>
                    {
                        timer.Stop();
                        try { Smoke.CaptureElement(w, (int)w.ActualWidth, (int)w.ActualHeight, pageShot.Substring("--page-shot=".Length)); } catch { }
                        Shutdown(0);
                    };
                    timer.Start();
                }
                return;
            }
        }

        ShortcutGuard.EnsureOnStartup();
        if (TryAutoLogin()) return;
        ShowLogin();
    }

    /// <summary>勾了「记住密码」就直接进主界面：更新安装完自动重开时不必再点一次登录。</summary>
    private static bool TryAutoLogin()
    {
        var saved = CredentialStore.Load();
        if (saved is null) return false;
        var r = Services.Data.Login(saved.Account, saved.Password);
        if (!r.Ok || Services.Data.CurrentUser is not { } user)
        {
            // 账号或密码已变，清掉旧的，回到手填
            CredentialStore.Clear();
            return false;
        }
        StartMain(user);
        return true;
    }

    /// <summary>带 --tray 启动（开机自启）时只留在托盘，不弹窗口。</summary>
    private static bool StartHidden => Environment.GetCommandLineArgs()
        .Any(a => string.Equals(a, "--tray", StringComparison.OrdinalIgnoreCase));

    private static void StartMain(Data.UserInfo user)
    {
        var main = new Windows.MainWindow(Services, user);
        Current.MainWindow = main;
        main.Show();
        if (StartHidden) main.Hide();
    }

    /// <summary>显示登录窗；登录成功后由本方法创建主窗。</summary>
    public static void ShowLogin()
    {
        var login = new Windows.LoginWindow(Services);
        login.LoggedIn += user =>
        {
            StartMain(user);
            login.Close();
        };
        login.Closed += (_, _) =>
        {
            if (!login.Succeeded) Current.Shutdown(0);
        };
        Current.MainWindow = login;
        login.Show();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        ZhifuWater.Desktop.Services.TrayIcon.Dispose();
        base.OnExit(e);
    }
}
