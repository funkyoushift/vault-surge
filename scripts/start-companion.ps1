$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$appUrl = "https://localhost:3000/"
$companionPort = 3000
$extensionPort = 8081

function Initialize-VaultSurgeBridgePairing {
    $envPath = Join-Path $projectRoot ".env.local"
    $tokenLine = Get-Content -LiteralPath $envPath |
        Where-Object { $_ -match '^\s*STREAMER_COMPANION_TOKEN\s*=' } |
        Select-Object -Last 1
    if (-not $tokenLine) {
        throw "STREAMER_COMPANION_TOKEN is missing from .env.local."
    }

    $pairingToken = ($tokenLine -split '=', 2)[1].Trim().Trim('"').Trim("'")
    if (
        [string]::IsNullOrWhiteSpace($pairingToken) -or
        $pairingToken -match '^replace_' -or
        $pairingToken -match '^YOUR_'
    ) {
        throw "STREAMER_COMPANION_TOKEN must contain the random token created during setup."
    }

    $configDirectory = Join-Path $env:LOCALAPPDATA "VaultSurge"
    $configPath = Join-Path $configDirectory "bridge.json"
    New-Item -ItemType Directory -Force -Path $configDirectory | Out-Null
    $configJson = @{ bridge_token = $pairingToken } | ConvertTo-Json
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($configPath, $configJson, $utf8NoBom)
}

function Test-VaultSurgePort([int]$port) {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    return $null -ne $listener
}

function Wait-VaultSurgePort([int]$port, [int]$timeoutSeconds = 45) {
    $deadline = (Get-Date).AddSeconds($timeoutSeconds)
    while ((Get-Date) -lt $deadline -and -not (Test-VaultSurgePort $port)) {
        Start-Sleep -Milliseconds 500
    }
    return Test-VaultSurgePort $port
}

function Show-LaunchError([string]$message) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
        $message,
        "Vault Surge could not start",
        [System.Windows.MessageBoxButton]::OK,
        [System.Windows.MessageBoxImage]::Error
    ) | Out-Null
}

try {
    $requiredPaths = @(
        (Join-Path $projectRoot "package.json"),
        (Join-Path $projectRoot "node_modules"),
        (Join-Path $projectRoot "scripts\companion-worker.mjs"),
        (Join-Path $projectRoot ".env.local"),
        (Join-Path $projectRoot ".certs\localhost.pem"),
        (Join-Path $projectRoot ".certs\localhost-key.pem")
    )
    $missing = @($requiredPaths | Where-Object { -not (Test-Path -LiteralPath $_) })
    if ($missing.Count -gt 0) {
        throw "The local installation is incomplete. Missing:`n$($missing -join "`n")"
    }

    if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
        throw "Node.js was not found. Install Node.js 22.13 or newer, then try again."
    }

    Initialize-VaultSurgeBridgePairing

    if (-not (Test-VaultSurgePort $companionPort)) {
        $escapedRoot = $projectRoot.Replace('"', '""')
        $serverCommand = "title Vault Surge Companion Server && cd /d `"$escapedRoot`" && npm.cmd run dev"
        Start-Process -FilePath "cmd.exe" -ArgumentList "/k", $serverCommand -WorkingDirectory $projectRoot
    }

    if (-not (Wait-VaultSurgePort $companionPort)) {
        throw "The companion did not begin listening on port 3000 within 45 seconds. Check the Vault Surge Companion Server window for the error."
    }

    if (-not (Test-VaultSurgePort $extensionPort)) {
        $escapedRoot = $projectRoot.Replace('"', '""')
        $extensionCommand = "title Vault Surge Twitch Component && cd /d `"$escapedRoot`" && npm.cmd run extension:serve"
        Start-Process -FilePath "cmd.exe" -ArgumentList "/k", $extensionCommand -WorkingDirectory $projectRoot
    }

    if (-not (Wait-VaultSurgePort $extensionPort)) {
        throw "The Twitch component did not begin listening on port 8081 within 45 seconds. Check the Vault Surge Twitch Component window for the error."
    }

    $nodePath = (Get-Command node.exe).Source
    $workerScript = Join-Path $projectRoot "scripts\companion-worker.mjs"
    $workerLog = Join-Path $projectRoot "companion-worker.log"
    $workerErrorLog = Join-Path $projectRoot "companion-worker-error.log"
    Start-Process -FilePath $nodePath `
        -ArgumentList "`"$workerScript`"" `
        -WorkingDirectory $projectRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $workerLog `
        -RedirectStandardError $workerErrorLog

    Start-Process $appUrl
    exit 0
}
catch {
    Show-LaunchError $_.Exception.Message
    exit 1
}
