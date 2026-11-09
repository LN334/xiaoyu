using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

namespace ZhifuWater.Desktop.Services;

/// <summary>
/// 「记住密码」的本地存储。密码用 Windows DPAPI（当前用户）加密后落盘，磁盘上没有明文；
/// 拷到别的机器或别的账户下也解不开。
/// </summary>
public static class CredentialStore
{
    private const int CryptProtectUiForbidden = 0x1;

    private static string FilePath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Xiaoyu", "login.json");

    /// <summary>改名前的「清渠」版本存过同一份凭据，第一次启动时迁过来。</summary>
    private static string LegacyFilePath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Qingqu", "login.json");

    public sealed class Saved
    {
        public string Account { get; set; } = "";
        public string Password { get; set; } = "";
    }

    public static Saved? Load()
    {
        try
        {
            var path = File.Exists(FilePath)
                ? FilePath
                : File.Exists(LegacyFilePath) ? LegacyFilePath : null;
            if (path is null) return null;
            var json = File.ReadAllText(path, Encoding.UTF8);
            var saved = JsonSerializer.Deserialize<Saved>(json);
            if (saved is null || string.IsNullOrEmpty(saved.Account) || string.IsNullOrEmpty(saved.Password)) return null;
            var plain = Transform(Convert.FromBase64String(saved.Password), encrypt: false);
            if (plain is null) return null;
            saved.Password = Encoding.UTF8.GetString(plain);
            return saved;
        }
        catch
        {
            return null;
        }
    }

    public static void Save(string account, string password)
    {
        try
        {
            var dir = Path.GetDirectoryName(FilePath);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
            var blob = Transform(Encoding.UTF8.GetBytes(password), encrypt: true);
            if (blob is null)
            {
                Clear();
                return;
            }
            var saved = new Saved { Account = account, Password = Convert.ToBase64String(blob) };
            File.WriteAllText(FilePath, JsonSerializer.Serialize(saved), Encoding.UTF8);
            if (File.Exists(LegacyFilePath)) File.Delete(LegacyFilePath);
        }
        catch
        {
            // 记不住不影响登录本身
        }
    }

    public static void Clear()
    {
        try
        {
            if (File.Exists(FilePath)) File.Delete(FilePath);
            if (File.Exists(LegacyFilePath)) File.Delete(LegacyFilePath);
        }
        catch
        {
        }
    }

    private static byte[]? Transform(byte[] data, bool encrypt)
    {
        var inBlob = new DataBlob { cbData = data.Length, pbData = Marshal.AllocHGlobal(data.Length) };
        Marshal.Copy(data, 0, inBlob.pbData, data.Length);
        try
        {
            var ok = encrypt
                ? CryptProtectData(ref inBlob, null, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, CryptProtectUiForbidden, out var outBlob)
                : CryptUnprotectData(ref inBlob, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, CryptProtectUiForbidden, out outBlob);
            if (!ok) return null;
            try
            {
                var result = new byte[outBlob.cbData];
                Marshal.Copy(outBlob.pbData, result, 0, outBlob.cbData);
                return result;
            }
            finally
            {
                LocalFree(outBlob.pbData);
            }
        }
        finally
        {
            Marshal.FreeHGlobal(inBlob.pbData);
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct DataBlob
    {
        public int cbData;
        public IntPtr pbData;
    }

    [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CryptProtectData(ref DataBlob pDataIn, string? szDataDescr, IntPtr pOptionalEntropy,
        IntPtr pvReserved, IntPtr pPromptStruct, int dwFlags, out DataBlob pDataOut);

    [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CryptUnprotectData(ref DataBlob pDataIn, IntPtr ppszDataDescr, IntPtr pOptionalEntropy,
        IntPtr pvReserved, IntPtr pPromptStruct, int dwFlags, out DataBlob pDataOut);

    [DllImport("kernel32.dll")]
    private static extern IntPtr LocalFree(IntPtr hMem);
}
