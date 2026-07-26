param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$GameSdkModsPath = "C:\Program Files (x86)\Steam\steamapps\common\Borderlands 4\sdk_mods"
)

$ErrorActionPreference = "Stop"

$resolvedProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$buildScript = Join-Path $resolvedProjectRoot "scripts\build-sdk-mod.ps1"
$packagePath = Join-Path $resolvedProjectRoot "build\sdk-mod\VaultSurge.sdkmod"

if (-not (Test-Path -LiteralPath $GameSdkModsPath -PathType Container)) {
    throw "Borderlands 4 SDK mods folder was not found: $GameSdkModsPath"
}

& $buildScript -ProjectRoot $resolvedProjectRoot

if (-not (Test-Path -LiteralPath $packagePath -PathType Leaf)) {
    throw "VaultSurge.sdkmod was not built: $packagePath"
}

$requiredDependencies = @(
    @{ Name = "mods_base"; Paths = @("mods_base.sdkmod", "mods_base") },
    @{ Name = "MattsSDKBoostingTools"; Paths = @("MattsSDKBoostingTools.sdkmod", "MattsSDKBoostingTools") },
    @{ Name = "ActorScriptDeployer"; Paths = @("ActorScriptDeployer.sdkmod", "ActorScriptDeployer", "ActorScriptDeployer.zip") }
)

$missing = foreach ($dependency in $requiredDependencies) {
    $found = $false
    foreach ($relativePath in $dependency.Paths) {
        if (Test-Path -LiteralPath (Join-Path $GameSdkModsPath $relativePath)) {
            $found = $true
            break
        }
    }
    if (-not $found) {
        $dependency.Name
    }
}

if ($missing.Count -gt 0) {
    throw "Required SDK dependencies are missing: $($missing -join ', '). Install them before Vault Surge."
}

$destination = Join-Path $GameSdkModsPath "VaultSurge.sdkmod"
Copy-Item -LiteralPath $packagePath -Destination $destination -Force
Write-Host "Installed Vault Surge SDK mod to $destination"

$envPath = Join-Path $resolvedProjectRoot ".env.local"
if (Test-Path -LiteralPath $envPath -PathType Leaf) {
    $tokenLine = Get-Content -LiteralPath $envPath |
        Where-Object { $_ -match '^\s*STREAMER_COMPANION_TOKEN\s*=' } |
        Select-Object -Last 1
    if ($tokenLine) {
        $pairingToken = ($tokenLine -split '=', 2)[1].Trim().Trim('"').Trim("'")
        if (
            -not [string]::IsNullOrWhiteSpace($pairingToken) -and
            $pairingToken -notmatch '^replace_' -and
            $pairingToken -notmatch '^YOUR_'
        ) {
            $configDirectory = Join-Path $env:LOCALAPPDATA "VaultSurge"
            $configPath = Join-Path $configDirectory "bridge.json"
            New-Item -ItemType Directory -Force -Path $configDirectory | Out-Null
            $configJson = @{ bridge_token = $pairingToken } | ConvertTo-Json
            $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
            [System.IO.File]::WriteAllText($configPath, $configJson, $utf8NoBom)
            Write-Host "Configured local SDK pairing at $configPath"
        }
    }
}
