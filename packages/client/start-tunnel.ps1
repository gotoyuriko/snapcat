param(
    [int]$Port = 8082,
    [int]$ApiPort = 3000
)

$cloudflared = "$env:USERPROFILE\cloudflared.exe"
if (-not (Test-Path $cloudflared)) {
    Write-Error "cloudflared.exe not found at $cloudflared"
    exit 1
}

$jobs = @()
$logs = @()

function Start-Tunnel($targetPort, $targetHost = '127.0.0.1') {
    $log = [System.IO.Path]::GetTempFileName()
    $logs += $log
    $p = Start-Process -FilePath $cloudflared `
        -ArgumentList "tunnel --no-autoupdate --protocol http2 --retries 5 --url http://${targetHost}:$targetPort" `
        -RedirectStandardError $log -PassThru -NoNewWindow
    $jobs += $p

    Write-Host "  Waiting for tunnel on port $targetPort..." -NoNewline
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep 1
        $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue
        if ($m) {
            Write-Host " done"
            return $m.Matches[0].Value
        }
        if ($p.HasExited) {
            Write-Host ""
            Write-Error "cloudflared exited early:`n$(Get-Content $log -Raw -ErrorAction SilentlyContinue)"
            exit 1
        }
        Write-Host "." -NoNewline
    }
    Write-Host ""
    Write-Error "Timed out waiting for tunnel on port $targetPort"
    exit 1
}

try {
    Write-Host "Starting Metro tunnel -> port $Port ..."
    # Metro (expo start --host localhost) binds the IPv6 loopback (::1) on this
    # machine, so the tunnel must target it explicitly — 127.0.0.1 gets a 502.
    $metroUrl = Start-Tunnel $Port '[::1]'
    Write-Host "Metro tunnel:   $metroUrl"

    Write-Host "Starting API tunnel -> port $ApiPort ..."
    $apiUrl = Start-Tunnel $ApiPort
    Write-Host "API tunnel:     $apiUrl"

    $metroHost = $metroUrl -replace 'https://',''
    $env:EXPO_PACKAGER_PROXY_URL    = $metroUrl
    $env:REACT_NATIVE_PACKAGER_HOSTNAME = $metroHost
    $env:EXPO_PUBLIC_API_URL        = $apiUrl

    Write-Host ""
    Write-Host "Starting Expo on port $Port ..."
    npx expo start --port $Port --host localhost
} finally {
    foreach ($p in $jobs) {
        if (-not $p.HasExited) { $p.Kill() }
    }
    foreach ($l in $logs) {
        Remove-Item $l -ErrorAction SilentlyContinue
    }
}
