$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Drawing, System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class W {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, IntPtr e);
}
"@
function Shot($rect, $path) {
  $w = [int]$rect.Width; $h = [int]$rect.Height
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen([int]$rect.X, [int]$rect.Y, 0, 0, $bmp.Size)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
$p = Start-Process -FilePath 'D:\智赋乡水平台\native\publish\Xiaoyu.exe' -ArgumentList '--main','--page=dashboard' -PassThru
Start-Sleep -Seconds 4
$root = [System.Windows.Automation.AutomationElement]::RootElement
$cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $p.Id)
$win = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $cond)
if (-not $win) { throw 'window not found' }
$bellCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty, 'bell')
$bell = $win.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $bellCond)
if (-not $bell) { throw 'bell not found' }
$inv = $bell.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
$inv.Invoke()
Start-Sleep -Milliseconds 700
$rowCond = New-Object System.Windows.Automation.AndCondition(
  (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty, 'notif-NT-998')),
  (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $p.Id))
)
$row = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $rowCond)
if (-not $row) { throw 'row not found' }
$r = $row.Current.BoundingRectangle
$cx = [int]($r.X + $r.Width / 2); $cy = [int]($r.Y + $r.Height / 2)
[W]::SetCursorPos($cx, $cy) | Out-Null
[W]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
[W]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
Start-Sleep -Milliseconds 1800
$wr = $win.Current.BoundingRectangle
Shot $wr 'D:\智赋乡水平台\_notify-click.png'
$p.Kill()
Write-Output ('clicked ' + $cx + ',' + $cy)
