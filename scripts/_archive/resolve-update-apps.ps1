$shell = New-Object -ComObject WScript.Shell
$paths = @(
  'C:\Users\PC\DeskBox\工具\UU远程.lnk',
  'C:\Users\PC\DeskBox\工具\AF Media Bar.lnk',
  'C:\Users\PC\DeskBox\工具\LightC.lnk'
)
foreach ($p in $paths) {
  if (Test-Path -LiteralPath $p) {
    $l = $shell.CreateShortcut($p)
    $t = $l.TargetPath
    $a = $l.Arguments
    Write-Output ("$p -> $t | $a")
  } else {
    Write-Output "missing: $p"
  }
}
