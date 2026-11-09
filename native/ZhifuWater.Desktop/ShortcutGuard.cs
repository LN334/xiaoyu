using System;
using System.IO;
using System.Runtime.InteropServices;

namespace ZhifuWater.Desktop;

/// <summary>
/// 桌面快捷方式自修复：安装版（自家目录里有安装包放的 Uninstall.exe）每次启动检查桌面上的「小禹.lnk」，
/// 不见了就照着自己重建一个。开发目录里运行不动任何桌面文件。
/// </summary>
internal static class ShortcutGuard
{
    private const string LinkName = "小禹.lnk";

    public static void EnsureOnStartup()
    {
        try
        {
            var exe = Environment.ProcessPath;
            if (string.IsNullOrEmpty(exe)) return;
            var dir = Path.GetDirectoryName(exe);
            if (string.IsNullOrEmpty(dir)) return;
            // 只认安装版：开发输出目录里没有 Uninstall.exe
            if (!File.Exists(Path.Combine(dir, "Uninstall.exe"))) return;
            var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            if (string.IsNullOrEmpty(desktop)) return;
            // 改名前的旧图标指向已卸载的「清渠」，留在桌面上只会点不开
            var legacy = Path.Combine(desktop, "清渠.lnk");
            try { if (File.Exists(legacy)) File.Delete(legacy); } catch { }
            var lnk = Path.Combine(desktop, LinkName);
            if (File.Exists(lnk)) return;
            Create(lnk, exe);
        }
        catch
        {
            // 快捷方式不是启动的必要条件：写不进去也不影响开机使用
        }
    }

    /// <summary>用 WScript.Shell 生成指向 exe 的 .lnk。成功返回 true（以文件真的存在为准）。</summary>
    internal static bool Create(string lnkPath, string exe)
    {
        var type = Type.GetTypeFromProgID("WScript.Shell");
        if (type == null) return false;
        object? shell = null;
        try
        {
            shell = Activator.CreateInstance(type);
            if (shell == null) return false;
            dynamic wsh = shell;
            dynamic link = wsh.CreateShortcut(lnkPath);
            link.TargetPath = exe;
            link.WorkingDirectory = Path.GetDirectoryName(exe) ?? string.Empty;
            link.IconLocation = exe + ",0";
            link.Description = "小禹 · 村镇水处理站智能运维平台";
            link.Save();
            return File.Exists(lnkPath);
        }
        finally
        {
            if (shell != null)
            {
                try { Marshal.ReleaseComObject(shell); } catch { }
            }
        }
    }
}
