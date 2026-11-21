[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$r = Invoke-RestMethod -Uri 'https://api.github.com/repos/zhongfly/mpv-winbuild/releases/latest' -Headers @{'User-Agent'='PowerShell'}
$a = $r.assets | Where-Object { $_.name -match '^mpv-dev-x86_64-\d+' } | Select-Object -First 1
Write-Host "Target: $($a.name)"
Write-Host "URL: $($a.browser_download_url)"
Invoke-WebRequest -Uri $a.browser_download_url -OutFile 'mpv-dev.7z'
if (!(Test-Path 'libmpv')) { New-Item -ItemType Directory -Path 'libmpv' }
tar -xf mpv-dev.7z -C libmpv
Get-ChildItem libmpv
