# Starts the local PostgreSQL database in WSL (Kali Linux) and keeps the connection alive
Write-Host "Starting local PostgreSQL database in WSL..." -ForegroundColor Cyan

# Ensure PostgreSQL systemd service is active in WSL
wsl -d kali-linux -u root -e systemctl start postgresql@18-main

# Start a background keepalive process in WSL so the VM network interface remains active
$existingKeepalive = Get-Process | Where-Object { $_.CommandLine -like "*kali-linux*sleep infinity*" }
if (-not $existingKeepalive) {
    Start-Process wsl -ArgumentList "-d", "kali-linux", "-u", "root", "--exec", "sleep", "infinity" -WindowStyle Hidden
}

# Verify port 5432 is responding
$attempt = 0
$connected = $false
while ($attempt -lt 10 -and -not $connected) {
    Start-Sleep -Milliseconds 500
    $test = Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -WarningAction SilentlyContinue
    if ($test.TcpTestSucceeded) {
        $connected = $true
    }
    $attempt++
}

if ($connected) {
    Write-Host "PostgreSQL is online and listening on 127.0.0.1:5432" -ForegroundColor Green
} else {
    Write-Host "Could not connect to PostgreSQL on 127.0.0.1:5432. Please check WSL status." -ForegroundColor Red
}
