# 小禹 · 图标生成脚本（v2）
# 用 GDI+ 直接绘制（支持透明通道），输出多尺寸 PNG 与 Windows ICO。
# 用法：
#   powershell -ExecutionPolicy Bypass -File make_icon.ps1            # 桌面图标（圆角+透明）
#   powershell -ExecutionPolicy Bypass -File make_icon.ps1 -Square    # 安卓图标（满幅方形）

param(
    [switch]$Square,
    [string]$OutDir = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$S = 1024
$bmp = New-Object System.Drawing.Bitmap($S, $S, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

function New-RoundRect([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    if ($r -le 0) {
        $p.AddRectangle((New-Object System.Drawing.RectangleF($x, $y, $w, $h)))
        return $p
    }
    $d = $r * 2
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

# ---------- 背景 ----------
if ($Square) { $bgPath = New-RoundRect 0 0 $S $S 0 }
else { $bgPath = New-RoundRect 0 0 $S $S 224 }

$bgRect = New-Object System.Drawing.Rectangle(0, 0, $S, $S)
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $bgRect,
    [System.Drawing.Color]::FromArgb(255, 6, 42, 41),
    [System.Drawing.Color]::FromArgb(255, 13, 116, 103),
    55.0)
$g.FillPath($bgBrush, $bgPath)

# ---------- 水滴 ----------
$drop = New-Object System.Drawing.Drawing2D.GraphicsPath
$drop.StartFigure()
$drop.AddBezier(512, 112, 596, 230, 748, 438, 748, 614)
$drop.AddArc(276, 378, 472, 472, 0, 180)
$drop.AddBezier(276, 614, 276, 438, 428, 230, 512, 112)
$drop.CloseFigure()

$dropRect = New-Object System.Drawing.Rectangle(240, 90, 560, 800)
$dropBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $dropRect,
    [System.Drawing.Color]::FromArgb(255, 255, 255, 255),
    [System.Drawing.Color]::FromArgb(255, 206, 241, 230),
    90.0)
$g.FillPath($dropBrush, $drop)

# 水滴内侧轻微描边，增强轮廓
$edgePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(40, 12, 92, 80), 6)
$g.DrawPath($edgePen, $drop)

# ---------- 叶芽（水滴内） ----------
$leaf = New-Object System.Drawing.Drawing2D.GraphicsPath
$leaf.StartFigure()
$leaf.AddBezier(512, 496, 615, 572, 634, 704, 512, 808)
$leaf.AddBezier(512, 808, 390, 704, 409, 572, 512, 496)
$leaf.CloseFigure()

$leafRect = New-Object System.Drawing.Rectangle(390, 496, 244, 312)
$leafBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $leafRect,
    [System.Drawing.Color]::FromArgb(255, 61, 208, 152),
    [System.Drawing.Color]::FromArgb(255, 9, 116, 92),
    72.0)
$g.FillPath($leafBrush, $leaf)

# 叶脉
$veinPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(170, 255, 255, 255), 13)
$veinPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$veinPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$g.DrawBezier($veinPen, 512, 528, 512, 606, 512, 690, 512, 782)

$branchPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(110, 255, 255, 255), 9)
$branchPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$branchPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$g.DrawBezier($branchPen, 512, 604, 540, 592, 556, 574, 566, 560)
$g.DrawBezier($branchPen, 512, 672, 484, 660, 466, 646, 456, 628)

# ---------- 输出 ----------
$master = Join-Path $OutDir ($(if ($Square) { 'icon_square_1024.png' } else { 'icon_1024.png' }))
$bmp.Save($master, [System.Drawing.Imaging.ImageFormat]::Png)

function Save-Resized([int]$size, [string]$path) {
    $dst = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $dg = [System.Drawing.Graphics]::FromImage($dst)
    $dg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $dg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $dg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $dg.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $dg.Clear([System.Drawing.Color]::Transparent)
    $dg.DrawImage($bmp, 0, 0, $size, $size)
    $dst.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $dg.Dispose()
    $dst.Dispose()
}

if ($Square) {
    foreach ($s in @(48, 72, 96, 144, 192, 512)) {
        Save-Resized $s (Join-Path $OutDir ("icon_square_{0}.png" -f $s))
    }
    Write-Host "square icon ok: $master"
} else {
    foreach ($s in @(16, 24, 32, 48, 64, 128, 256, 512)) {
        Save-Resized $s (Join-Path $OutDir ("icon_{0}.png" -f $s))
    }

    # 组装多尺寸 ICO（PNG 压缩条目）
    $sizes = @(16, 24, 32, 48, 64, 128, 256)
    $blobs = New-Object 'System.Collections.Generic.List[byte[]]'
    foreach ($s in $sizes) {
        $blobs.Add([System.IO.File]::ReadAllBytes((Join-Path $OutDir ("icon_{0}.png" -f $s))))
    }

    $bytes = New-Object 'System.Collections.Generic.List[byte]'
    function Add-U16([int]$v) { $bytes.Add([byte]($v -band 0xFF)); $bytes.Add([byte](($v -shr 8) -band 0xFF)) }
    function Add-U32([long]$v) {
        $bytes.Add([byte]($v -band 0xFF)); $bytes.Add([byte](($v -shr 8) -band 0xFF))
        $bytes.Add([byte](($v -shr 16) -band 0xFF)); $bytes.Add([byte](($v -shr 24) -band 0xFF))
    }

    Add-U16 0; Add-U16 1; Add-U16 $sizes.Count
    $offset = 6 + 16 * $sizes.Count
    for ($i = 0; $i -lt $sizes.Count; $i++) {
        $s = $sizes[$i]
        $dim = if ($s -ge 256) { 0 } else { $s }
        $bytes.Add([byte]$dim); $bytes.Add([byte]$dim)
        $bytes.Add([byte]0); $bytes.Add([byte]0)
        Add-U16 1; Add-U16 32
        Add-U32 $blobs[$i].Length
        Add-U32 $offset
        $offset += $blobs[$i].Length
    }
    foreach ($b in $blobs) { $bytes.AddRange($b) }
    [System.IO.File]::WriteAllBytes((Join-Path $OutDir 'icon.ico'), $bytes.ToArray())
    Write-Host ("desktop icon ok: {0} + icon.ico ({1:N0} bytes)" -f $master, (Get-Item (Join-Path $OutDir 'icon.ico')).Length)
}

$g.Dispose()
$bmp.Dispose()
