Add-Type -AssemblyName System.Drawing

function Draw-LedgerIcon($g, $size) {
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush([System.Drawing.Rectangle]::new(0,0,$size,$size), [System.Drawing.Color]::FromArgb(1, 19, 44), [System.Drawing.Color]::FromArgb(7, 29, 63), [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal)
    $g.FillRectangle($bgBrush, 0, 0, $size, $size)

    $paperRect = [System.Drawing.Rectangle]::new([math]::Floor($size * 0.15), [math]::Floor($size * 0.12), [math]::Floor($size * 0.7), [math]::Floor($size * 0.76))
    $paperBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(245, 248, 255))
    $paperPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(190, 200, 220), [math]::Max(1, [math]::Round($size * 0.03)))
    $g.FillRectangle($paperBrush, $paperRect)
    $g.DrawRectangle($paperPen, $paperRect)

    $linePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(145, 158, 171), [math]::Max(1, [math]::Round($size * 0.02)))
    $lineSpacing = [math]::Floor($size * 0.14)
    for ($i = 1; $i -le 3; $i++) {
        $y = $paperRect.Y + ($i * $lineSpacing)
        $g.DrawLine($linePen, $paperRect.X + [math]::Floor($size * 0.08), $y, $paperRect.Right - [math]::Floor($size * 0.08), $y)
    }

    $chartX = $paperRect.X + [math]::Floor($size * 0.11)
    $chartY = $paperRect.Y + [math]::Floor($size * 0.4)
    $barWidth = [math]::Floor($size * 0.1)
    $barSpacing = [math]::Floor($size * 0.08)
    $barHeights = @(0.45, 0.65, 0.35)
    $barBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(34, 92, 180))
    $barPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(16, 54, 115), [math]::Max(1, [math]::Round($size * 0.02)))
    for ($j = 0; $j -lt 3; $j++) {
        $x = $chartX + ($j * ($barWidth + $barSpacing))
        $height = [math]::Floor($paperRect.Height * $barHeights[$j])
        $top = $paperRect.Bottom - [math]::Floor($size * 0.08) - $height
        $rect = [System.Drawing.Rectangle]::new($x, $top, $barWidth, $height)
        $g.FillRectangle($barBrush, $rect)
        $g.DrawRectangle($barPen, $rect)
    }

    $checkBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(54, 126, 210))
    $dotsX = $paperRect.Right - [math]::Floor($size * 0.18)
    $dotsY = $paperRect.Y + [math]::Floor($size * 0.16)
    for ($k = 0; $k -lt 3; $k++) {
        $g.FillEllipse($checkBrush, $dotsX, $dotsY + ($k * [math]::Floor($size * 0.1)), [math]::Floor($size * 0.055), [math]::Floor($size * 0.055))
    }
}

function New-Icon($path, $size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    Draw-LedgerIcon $g $size
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

New-Icon 'public/icon-192x192.png' 192
New-Icon 'public/icon-512x512.png' 512

$size = 64
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
Draw-LedgerIcon $g $size
$icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
$fs = [System.IO.File]::OpenWrite('public/favicon.ico')
$icon.Save($fs)
$fs.Close()
$icon.Dispose()
$g.Dispose()
$bmp.Dispose()
