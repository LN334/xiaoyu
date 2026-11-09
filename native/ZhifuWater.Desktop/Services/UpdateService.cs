using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace ZhifuWater.Desktop.Services;

public sealed record UpdateInfo(
    Version Version,
    string Tag,
    string Notes,
    string AssetName,
    string AssetUrl,
    string Sha256,
    long Size,
    string PageUrl);

public sealed class UpdateSettings
{
    public bool AutoCheck { get; set; } = true;
    public string? LastCheckUtc { get; set; }
}

/// <summary>基于 GitHub Releases 的更新检查、下载与安装。发布页即更新源，无需自建服务端。</summary>
public static class UpdateService
{
    public const string Repo = "LN334/xiaoyu";
    private const string DefaultFeed = "https://api.github.com/repos/" + Repo + "/releases/latest";
    private static readonly HttpClient Http = CreateClient();

    public static Version CurrentVersion =>
        Normalize(typeof(UpdateService).Assembly.GetName().Version ?? new Version(2, 0, 12));

    public static string CurrentVersionText => CurrentVersion.ToString(3);

    public static string ReleasesPage => "https://github.com/" + Repo + "/releases";

    private static HttpClient CreateClient()
    {
        var c = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
        c.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", "Xiaoyu-Desktop-Updater");
        c.DefaultRequestHeaders.TryAddWithoutValidation("Accept", "application/vnd.github+json");
        return c;
    }

    public static Version Normalize(Version v) => new(v.Major, v.Minor, Math.Max(v.Build, 0));

    private static string SettingsPath
    {
        get
        {
            var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Xiaoyu");
            Directory.CreateDirectory(dir);
            return Path.Combine(dir, "update.json");
        }
    }

    public static UpdateSettings LoadSettings()
    {
        try
        {
            if (File.Exists(SettingsPath))
                return JsonSerializer.Deserialize<UpdateSettings>(File.ReadAllText(SettingsPath)) ?? new UpdateSettings();
        }
        catch { }
        return new UpdateSettings();
    }

    public static void SaveSettings(UpdateSettings s)
    {
        try { File.WriteAllText(SettingsPath, JsonSerializer.Serialize(s)); } catch { }
    }

    /// <summary>检查更新。feed 可指向 GitHub API、本地 JSON 清单或 HTTP 清单，便于内网/离线测试。</summary>
    public static async Task<UpdateInfo?> CheckAsync(string? feed = null, CancellationToken ct = default)
    {
        feed ??= Environment.GetEnvironmentVariable("XIAOYU_UPDATE_FEED")
                ?? Environment.GetEnvironmentVariable("QINGQU_UPDATE_FEED");
        if (string.IsNullOrWhiteSpace(feed)) feed = DefaultFeed;

        string json;
        if (!feed.StartsWith("http", StringComparison.OrdinalIgnoreCase))
        {
            if (!File.Exists(feed)) throw new FileNotFoundException("找不到更新清单：" + feed);
            json = await File.ReadAllTextAsync(feed, ct);
        }
        else
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, feed);
            using var resp = await Http.SendAsync(req, ct);
            resp.EnsureSuccessStatusCode();
            json = await resp.Content.ReadAsStringAsync(ct);
        }

        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        if (root.TryGetProperty("draft", out var draft) && draft.ValueKind == JsonValueKind.True) return null;
        if (root.TryGetProperty("prerelease", out var pre) && pre.ValueKind == JsonValueKind.True) return null;

        var tag = root.TryGetProperty("tag_name", out var t) ? t.GetString() ?? "" : "";
        var version = ParseVersion(tag) ?? ParseVersion(root.TryGetProperty("version", out var v) ? v.GetString() : null);
        if (version == null) return null;

        var notes = root.TryGetProperty("body", out var b) ? b.GetString() ?? "" : "";
        var page = root.TryGetProperty("html_url", out var h) ? h.GetString() ?? ReleasesPage : ReleasesPage;
        string? assetName = null, assetUrl = null, digest = null;
        long size = 0;

        if (root.TryGetProperty("assets", out var assets) && assets.ValueKind == JsonValueKind.Array)
        {
            foreach (var a in assets.EnumerateArray())
            {
                var name = a.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "";
                if (!name.StartsWith("Xiaoyu-Setup-", StringComparison.OrdinalIgnoreCase) ||
                    !name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) continue;
                assetName = name;
                assetUrl = a.TryGetProperty("browser_download_url", out var u) ? u.GetString() : null;
                digest = a.TryGetProperty("digest", out var d) ? d.GetString() : null;
                if (a.TryGetProperty("size", out var sz) && sz.TryGetInt64(out var s2)) size = s2;
                break;
            }
        }

        if (version <= CurrentVersion || string.IsNullOrEmpty(assetUrl)) return null;

        var sha = ExtractSha(digest, notes);
        return new UpdateInfo(version, tag, notes.Trim(), assetName ?? "", assetUrl!, sha, size, page);
    }

    public static Version? ParseVersion(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var s = text.Trim();
        if (s.StartsWith("v", StringComparison.OrdinalIgnoreCase)) s = s[1..];
        var cut = s.IndexOfAny(new[] { '-', '+', ' ' });
        if (cut > 0) s = s[..cut];
        return Version.TryParse(s, out var v) ? Normalize(v) : null;
    }

    private static string ExtractSha(string? digest, string notes)
    {
        if (!string.IsNullOrEmpty(digest))
        {
            var d = digest.Trim();
            if (d.StartsWith("sha256:", StringComparison.OrdinalIgnoreCase)) return d[7..].Trim();
            if (d.Length == 64) return d;
        }
        var m = System.Text.RegularExpressions.Regex.Match(notes,
            @"SHA256\s*[:：]?\s*([0-9a-fA-F]{64})", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        return m.Success ? m.Groups[1].Value.ToLowerInvariant() : "";
    }

    public static string DownloadDirectory
    {
        get
        {
            var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Xiaoyu", "Updates");
            Directory.CreateDirectory(dir);
            return dir;
        }
    }

    public static async Task<string> DownloadAsync(UpdateInfo info, IProgress<double>? progress, CancellationToken ct = default)
    {
        var target = Path.Combine(DownloadDirectory, info.AssetName);
        var part = target + ".part";
        if (File.Exists(part)) File.Delete(part);

        using (var resp = await Http.GetAsync(info.AssetUrl, HttpCompletionOption.ResponseHeadersRead, ct))
        {
            resp.EnsureSuccessStatusCode();
            var total = resp.Content.Headers.ContentLength ?? info.Size;
            await using var src = await resp.Content.ReadAsStreamAsync(ct);
            await using var dst = new FileStream(part, FileMode.Create, FileAccess.Write, FileShare.None, 81920, true);
            var buffer = new byte[81920];
            long read = 0;
            int n;
            while ((n = await src.ReadAsync(buffer, ct)) > 0)
            {
                await dst.WriteAsync(buffer.AsMemory(0, n), ct);
                read += n;
                if (total > 0) progress?.Report(Math.Clamp(read * 100.0 / total, 0, 100));
            }
        }

        var sha = await Sha256Async(part, ct);
        if (!string.IsNullOrEmpty(info.Sha256) &&
            !string.Equals(sha, info.Sha256, StringComparison.OrdinalIgnoreCase))
        {
            File.Delete(part);
            throw new InvalidOperationException("安装包校验失败，已删除下载文件。");
        }
        if (File.Exists(target)) File.Delete(target);
        File.Move(part, target);
        progress?.Report(100);
        return target;
    }

    private static async Task<string> Sha256Async(string path, CancellationToken ct)
    {
        await using var fs = File.OpenRead(path);
        using var sha = SHA256.Create();
        var hash = await sha.ComputeHashAsync(fs, ct);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    /// <summary>更新过程诊断日志，写到 %LOCALAPPDATA%\Xiaoyu\update.log，便于排查「点了没反应」。</summary>
    public static void Log(string message)
    {
        try
        {
            var dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Xiaoyu");
            Directory.CreateDirectory(dir);
            File.AppendAllText(Path.Combine(dir, "update.log"),
                DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + message + Environment.NewLine,
                new UTF8Encoding(false));
        }
        catch
        {
            // 日志失败不影响更新流程
        }
    }

    /// <summary>以管理员权限启动安装并退出当前程序：安装器静默升级，完成后重新拉起新版。</summary>
    public static bool ApplyAndRestart(string installerPath)
    {
        var exe = Environment.ProcessPath ?? Path.Combine(AppContext.BaseDirectory, "Xiaoyu.exe");
        var script = Path.Combine(Path.GetTempPath(), "xiaoyu-update.ps1");
        var log = Path.Combine(Path.GetTempPath(), "xiaoyu-update.log");
        Log("apply: 请求管理员权限，安装包=" + installerPath);
        var ps =
            "$ErrorActionPreference='Continue'\r\n" +
            "$log = " + PsQuote(log) + "\r\n" +
            "\"script-start\" | Out-File $log -Append -Encoding utf8\r\n" +
            // 先等小禹自己退出，否则安装包会因文件被占用而失败
            "for ($i = 0; $i -lt 60; $i++) {\r\n" +
            "  if (-not (Get-Process Xiaoyu -ErrorAction SilentlyContinue)) { break }\r\n" +
            "  Start-Sleep -Milliseconds 500\r\n" +
            "}\r\n" +
            "try {\r\n" +
            "  $p = Start-Process -FilePath " + PsQuote(installerPath) + " -ArgumentList '/S' -PassThru -Wait -ErrorAction Stop\r\n" +
            "  \"exit=$($p.ExitCode)\" | Out-File $log -Append -Encoding utf8\r\n" +
            "} catch {\r\n" +
            "  \"error=$($_.Exception.Message)\" | Out-File $log -Append -Encoding utf8\r\n" +
            "}\r\n" +
            // 安装完成后由 explorer 拉起新版，避免新进程继承管理员令牌。
            "Start-Process -FilePath 'explorer.exe' -ArgumentList " + PsQuote("\"" + exe + "\"") + "\r\n";
        File.WriteAllText(script, ps, new UTF8Encoding(true));

        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File " + PsQuote(script),
                UseShellExecute = true,
                Verb = "runas",
                WindowStyle = ProcessWindowStyle.Hidden,
            });
        }
        catch (System.ComponentModel.Win32Exception)
        {
            Log("apply: 用户在系统弹窗中点取消，未获得管理员权限");
            return false;
        }

        System.Windows.Application.Current.Shutdown();
        return true;
    }

    private static string PsQuote(string path) => "'" + path.Replace("'", "''") + "'";
}
