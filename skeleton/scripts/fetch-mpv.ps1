# Fetch and unpack the Windows x86_64 libmpv development archive.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$release = Invoke-RestMethod -Uri 'https://api.github.com/repos/zhongfly/mpv-winbuild/releases/latest' -Headers @{ 'User-Agent' = 'Valor' }
$asset = $release.assets | Where-Object { $_.name -match '^mpv-dev-x86_64-\d+.*\.7z$' } | Select-Object -First 1
if (-not $asset) { throw 'No x86_64 development archive was found in the latest release.' }
New-Item -ItemType Directory -Force -Path 'libmpv' | Out-Null
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile 'mpv-dev.7z'
tar -xf 'mpv-dev.7z' -C 'libmpv'
