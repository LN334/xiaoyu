Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
$exe = 'D:\小禹\native\ZhifuWater.Desktop\bin\Release\net8.0-windows\Xiaoyu.exe'
$p = Start-Process -FilePath $exe -ArgumentList '--main' -PassThru
Start-Sleep -Seconds 3
$root = [System.Windows.Automation.AutomationElement]::RootElement
function Find-Id($id) {
  $cond = New-Object System.Windows.Automation.AndCondition(
    (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $p.Id)),
    (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty, $id)))
  return $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
}
function Shot($path) {
  $w = $null
  foreach ($win in $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)) {
    if ($win.Current.ProcessId -eq $p.Id) { $w = $win; break }
  }
  if ($w -eq $null) { return }
  $r = $w.Current.BoundingRectangle
  $bmp = New-Object System.Drawing.Bitmap([int]$r.Width, [int]$r.Height)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen([int]$r.X, [int]$r.Y, 0, 0, $bmp.Size)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
Shot 'D:\小禹\_notify-before.png'
$bell = Find-Id 'bell'
if ($bell -ne $null) {
  $bell.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
  Start-Sleep -Milliseconds 700
  $mark = Find-Id 'mark-all-read'
  if ($mark -ne $null) {
    $mark.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    Start-Sleep -Milliseconds 1200
  } else { Write-Output 'mark button missing' }
} else { Write-Output 'bell missing' }
Shot 'D:\小禹\_notify-after.png'
$p.Kill()
