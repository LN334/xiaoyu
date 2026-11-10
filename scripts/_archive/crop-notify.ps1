Add-Type -AssemblyName System.Drawing
foreach ($n in @('before','after')) {
  $src = [System.Drawing.Image]::FromFile("D:\小禹\_notify-$n.png")
  $w = [int]($src.Width * 0.40)
  $h = [int]($src.Height * 0.14)
  $rect = New-Object System.Drawing.Rectangle ([int]($src.Width * 0.60)), 0, $w, $h
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, $w, $h), $rect, [System.Drawing.GraphicsUnit]::Pixel)
  $bmp.Save("D:\小禹\_notify-top-$n.png")
  $g.Dispose(); $bmp.Dispose(); $src.Dispose()
}
