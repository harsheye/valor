Add-Type -AssemblyName System.Drawing

function Export-VIcon {
    param(
        [int]$size,
        [string]$outPath,
        [double]$paddingFactor = 0.1
    )
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear([System.Drawing.Color]::Transparent)

    $vbW = 120.0
    $vbH = 130.0
    $usableW = $size * (1.0 - 2.0 * $paddingFactor)
    $usableH = $size * (1.0 - 2.0 * $paddingFactor)
    $scale = [Math]::Min($usableW / $vbW, $usableH / $vbH)
    
    $offsetX = ($size - ($vbW * $scale)) / 2.0
    $offsetY = ($size - ($vbH * $scale)) / 2.0

    $pt1 = New-Object System.Drawing.PointF ([float]($offsetX + 14.0 * $scale)), ([float]($offsetY + 14.0 * $scale))
    $ptBottom = New-Object System.Drawing.PointF ([float]($offsetX + 60.0 * $scale)), ([float]($offsetY + 110.0 * $scale))
    $pt2 = New-Object System.Drawing.PointF ([float]($offsetX + 106.0 * $scale)), ([float]($offsetY + 14.0 * $scale))

    $gradTop = New-Object System.Drawing.PointF ([float]$offsetX), ([float]($offsetY + 14.0 * $scale))
    $gradBottom = New-Object System.Drawing.PointF ([float]$offsetX), ([float]($offsetY + 110.0 * $scale))

    $cTop = [System.Drawing.Color]::FromArgb(255, 255, 90, 104)
    $cBottom = [System.Drawing.Color]::FromArgb(255, 122, 12, 25)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $gradTop, $gradBottom, $cTop, $cBottom

    $pen = New-Object System.Drawing.Pen $brush, ([float](13.0 * $scale))
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

    $g.DrawLine($pen, $pt1, $ptBottom)
    $g.DrawLine($pen, $pt2, $ptBottom)

    $pen.Dispose()
    $brush.Dispose()
    $g.Dispose()

    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Generated $outPath ($size x $size)"
}

Export-VIcon 192 "public/icon-192.png" 0.1
Export-VIcon 512 "public/icon-512.png" 0.1
Export-VIcon 180 "public/apple-touch-icon.png" 0.1
Export-VIcon 512 "public/icon-maskable-512.png" 0.2
