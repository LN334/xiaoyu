param([string]$Out = 'D:\小禹\_app.png')
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class AppShot {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  public static List<IntPtr> ForPid(uint pid) {
    var list = new List<IntPtr>();
    EnumWindows((h, p) => {
      uint wp; GetWindowThreadProcessId(h, out wp);
      if (wp == pid && IsWindowVisible(h)) list.Add(h);
      return true;
    }, IntPtr.Zero);
    return list;
  }
}
"@
$proc = Get-Process Xiaoyu -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $proc) { throw 'Xiaoyu not running' }
$wins = [AppShot]::ForPid([uint32]$proc.Id)
if ($wins.Count -eq 0) { throw 'no visible window' }
$items = @()
foreach ($h in $wins) {
  $r = New-Object AppShot+RECT
  [AppShot]::GetWindowRect($h, [ref]$r) | Out-Null
  if (($r.Right - $r.Left) -gt 0 -and ($r.Bottom - $r.Top) -gt 0) {
    $items += [pscustomobject]@{ H = $h; L = $r.Left; T = $r.Top; R = $r.Right; B = $r.Bottom }
  }
}
if ($items.Count -eq 0) { throw 'no sized window' }
$minX = ($items | Measure-Object -Property L -Minimum).Minimum
$minY = ($items | Measure-Object -Property T -Minimum).Minimum
$maxX = ($items | Measure-Object -Property R -Maximum).Maximum
$maxY = ($items | Measure-Object -Property B -Maximum).Maximum
$bmp = New-Object System.Drawing.Bitmap(($maxX - $minX), ($maxY - $minY))
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(243, 246, 247))
foreach ($it in $items) {
  $w = $it.R - $it.L; $ht = $it.B - $it.T
  $sub = New-Object System.Drawing.Bitmap($w, $ht)
  $sg = [System.Drawing.Graphics]::FromImage($sub)
  $hdc = $sg.GetHdc()
  [AppShot]::PrintWindow($it.H, $hdc, 2) | Out-Null
  $sg.ReleaseHdc($hdc)
  $g.DrawImage($sub, ($it.L - $minX), ($it.T - $minY))
  $sub.Dispose()
}
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output ("saved " + $Out + " " + $bmp.Width + "x" + $bmp.Height + " windows=" + $items.Count)
