Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
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
$badgeBefore = Find-Id 'bell-badge'
Write-Output ("badgeBefore=" + ($badgeBefore -ne $null))
$bell = Find-Id 'bell'
if ($bell -ne $null) {
  $bell.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
  Start-Sleep -Milliseconds 700
  $mark = Find-Id 'mark-all-read'
  Write-Output ("markButton=" + ($mark -ne $null))
  if ($mark -ne $null) {
    $mark.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    Start-Sleep -Milliseconds 900
  }
}
$badgeAfter = Find-Id 'bell-badge'
Write-Output ("badgeAfter=" + ($badgeAfter -ne $null))
if ($badgeAfter -ne $null) {
  try { Write-Output ("badgeHidden=" + $badgeAfter.Current.IsOffscreen) } catch {}
}
$p.Kill()
