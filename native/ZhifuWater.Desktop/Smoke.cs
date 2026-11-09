using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using ZhifuWater.Desktop.Data;
using ZhifuWater.Desktop.Pages;
using ZhifuWater.Desktop.Windows;

namespace ZhifuWater.Desktop;

/// <summary>启动自检：--smoke 时构造登录窗与主窗、遍历 14 个页面、构造触摸屏窗口，打印 DESKTOP-SMOKE OK 后退出。</summary>
public static class Smoke
{
    public static int Run(AppServices services, bool shots = false)
    {
        SmokeConsole.Init();
        var sw = Stopwatch.StartNew();
        var mainMs = 0L;
        var shotDir = Path.Combine(Path.GetTempPath(), "zhifu-desktop-shots");
        try
        {
            if (shots) Directory.CreateDirectory(shotDir);
            SmokeConsole.WriteLine("DESKTOP-SMOKE 开始自检 · " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));

            var login = new LoginWindow(services);
            if (shots && login.Content is FrameworkElement lc)
                CaptureElement(lc, 1080, 720, Path.Combine(shotDir, "login.png"));
            SmokeConsole.WriteLine($"  [1/4] 登录窗构造 OK · 账号 {login.Account}");

            var loginResult = services.Data.Login("admin", "water123");
            if (!loginResult.Ok) throw new InvalidOperationException("演示账号登录失败：" + loginResult.Message);
            if (!services.Data.Sites.Any()) throw new InvalidOperationException("站点数据为空");
            if (!services.Data.Points.Any()) throw new InvalidOperationException("点位数据为空");
            var user = services.Data.CurrentUser ?? throw new InvalidOperationException("登录后 CurrentUser 为空");

            var main = new MainWindow(services, user);
            if (shots) { services.Data.Tick(); services.Data.Tick(); }
            mainMs = sw.ElapsedMilliseconds;
            if (mainMs > 3000) throw new TimeoutException("主窗构造耗时 " + mainMs + " ms，超过 3 秒阈值");
            SmokeConsole.WriteLine($"  [2/4] 主窗构造 OK ({mainMs} ms) · 导航 15 项 · 默认 {main.Width}×{main.Height}");
            if (shots && main.Content is FrameworkElement mc)
            {
                var mw = int.TryParse(Environment.GetEnvironmentVariable("SHOT_W"), out var shotW) ? shotW : 1440;
                var mh = int.TryParse(Environment.GetEnvironmentVariable("SHOT_H"), out var sh) ? sh : 900;
                CaptureElement(mc, mw, mh, Path.Combine(shotDir, "main.png"));
            }

            var pages = main.SmokeExercisePages(shots ? shotDir : null);
            SmokeConsole.WriteLine($"  [3/4] 页面静态构建 OK · 14 页 + 触摸屏（Measure/Arrange/UpdateLayout）");

            var kiosk = new KioskWindow(services);
            var cards = kiosk.CardCount;
            var units = kiosk.UnitCount;
            if (shots)
            {
                try
                {
                    kiosk.WindowStartupLocation = WindowStartupLocation.Manual;
                    kiosk.WindowState = WindowState.Normal;
                    kiosk.ShowActivated = false;
                    kiosk.ShowInTaskbar = false;
                    kiosk.Left = -4000;
                    kiosk.Top = -4000;
                    kiosk.Width = 1920;
                    kiosk.Height = 1080;
                    kiosk.Show();
                    kiosk.UpdateLayout();
                    if (kiosk.Content is FrameworkElement kc)
                        CaptureElement(kc, 1920, 1080, Path.Combine(shotDir, "kiosk.png"));
                }
                catch (Exception ex)
                {
                    SmokeConsole.WriteLine("  [warn] 触摸屏截图失败：" + ex.Message);
                }
            }
            kiosk.Close();
            if (units != 11) throw new InvalidOperationException("触摸屏单元数应为 11，实际 " + units);
            SmokeConsole.WriteLine($"  [4/4] 触摸屏构造 OK · 状态卡 {cards} · 单元 {units}");

            var webView = typeof(App).Assembly.GetTypes().Where(t => t.FullName != null && t.FullName.Contains("WebView", StringComparison.OrdinalIgnoreCase)).ToList();
            if (webView.Count > 0) throw new InvalidOperationException("检测到 WebView 依赖：" + string.Join(",", webView.Select(t => t.FullName)));

            var lnkTest = Path.Combine(Path.GetTempPath(), "xiaoyu-shortcut-selftest.lnk");
            try { if (File.Exists(lnkTest)) File.Delete(lnkTest); } catch { }
            var lnkMade = ShortcutGuard.Create(lnkTest, Environment.ProcessPath ?? string.Empty);
            var lnkOk = lnkMade && File.Exists(lnkTest);
            try { if (File.Exists(lnkTest)) File.Delete(lnkTest); } catch { }
            SmokeConsole.WriteLine((lnkOk ? "SHORTCUT-SELFTEST OK " : "SHORTCUT-SELFTEST FAILED ") + lnkTest);
            if (!lnkOk) throw new InvalidOperationException("桌面快捷方式自修复不可用（WScript.Shell 未生成 .lnk）");

            SmokeConsole.WriteLine($"DESKTOP-SMOKE OK pages={pages} kiosk={units} main={mainMs}ms total={sw.ElapsedMilliseconds}ms");
            if (shots) SmokeConsole.WriteLine("DESKTOP-SHOTS " + shotDir);
            SmokeConsole.WriteLine("说明：本自检只验证窗口与页面能构造、能量算布局；未做真实鼠标点击。");
            return 0;
        }
        catch (Exception ex)
        {
            SmokeConsole.WriteLine("DESKTOP-SMOKE FAIL " + ex.GetType().Name + ": " + ex.Message);
            SmokeConsole.WriteLine(ex.StackTrace ?? "");
            return 1;
        }
    }

    /// <summary>把已布局的元素渲染成 PNG，供静态自查（不替代真实点击测试）。</summary>
    internal static void CaptureElement(FrameworkElement element, int width, int height, string path)
    {
        element.Measure(new Size(width, height));
        element.Arrange(new Rect(0, 0, width, height));
        element.UpdateLayout();

        // 150% / 200% 缩放下按窗口实际 DPI 放大像素，截图才不会糊（尺寸仍是同一套布局）。
        double scaleX = 1, scaleY = 1;
        try
        {
            var dpi = VisualTreeHelper.GetDpi(element);
            if (dpi.DpiScaleX > 0) scaleX = dpi.DpiScaleX;
            if (dpi.DpiScaleY > 0) scaleY = dpi.DpiScaleY;
        }
        catch { }

        var pixelWidth = Math.Max(1, (int)Math.Round(width * scaleX));
        var pixelHeight = Math.Max(1, (int)Math.Round(height * scaleY));
        var bitmap = new RenderTargetBitmap(pixelWidth, pixelHeight, 96 * scaleX, 96 * scaleY, PixelFormats.Pbgra32);
        bitmap.Render(element);
        var encoder = new PngBitmapEncoder();
        encoder.Frames.Add(BitmapFrame.Create(bitmap));
        using var stream = File.Create(path);
        encoder.Save(stream);
    }
}

internal static class SmokeConsole
{
    private const int StdOutputHandle = -11;
    private const uint GenericWrite = 0x40000000;
    private const uint FileShareWrite = 0x00000002;
    private const uint OpenExisting = 3;

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AttachConsole(uint processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr CreateFileW(string name, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetStdHandle(int handle, IntPtr value);

    private static readonly StringBuilder Fallback = new();
    private static readonly string LogPath = Path.Combine(Path.GetTempPath(), "zhifu-desktop-smoke.log");

    public static void Init()
    {
        try
        {
            AttachConsole(unchecked((uint)-1));
            var handle = CreateFileW("CONOUT$", GenericWrite, FileShareWrite, IntPtr.Zero, OpenExisting, 0, IntPtr.Zero);
            if (handle != IntPtr.Zero && handle != new IntPtr(-1))
            {
                SetStdHandle(StdOutputHandle, handle);
                var writer = new StreamWriter(Console.OpenStandardOutput(), Encoding.UTF8) { AutoFlush = true };
                Console.SetOut(writer);
            }
        }
        catch
        {
            // 没有控制台时仅写日志文件。
        }
    }

    public static void WriteLine(string text)
    {
        try { Console.WriteLine(text); } catch { Fallback.AppendLine(text); }
        try { File.AppendAllText(LogPath, text + Environment.NewLine, Encoding.UTF8); } catch { }
    }
}
