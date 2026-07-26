param(
    [ValidateSet("core", "movement", "spawn", "all")]
    [string]$Group = "all",
    [string]$BridgeUrl = "http://127.0.0.1:49775"
)

$ErrorActionPreference = "Stop"

$configPath = Join-Path $env:LOCALAPPDATA "VaultSurge\bridge.json"
if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    throw "Vault Surge bridge configuration was not found: $configPath"
}

$bridgeToken = (Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json).bridge_token
if ([string]::IsNullOrWhiteSpace($bridgeToken)) {
    throw "Vault Surge bridge token is missing."
}

$headers = @{ "X-Vault-Surge-Token" = $bridgeToken }
$cases = @(
    @{ Group = "core"; Effect = "heal_player"; Parameters = @{} },
    @{ Group = "core"; Effect = "add_currency"; Parameters = @{} },
    @{ Group = "core"; Effect = "add_eridium"; Parameters = @{} },
    @{ Group = "core"; Effect = "remove_currency"; Parameters = @{} },
    @{ Group = "core"; Effect = "spawn_item"; Parameters = @{} },
    @{ Group = "core"; Effect = "loot_luck"; Parameters = @{} },
    @{ Group = "core"; Effect = "full_ammo"; Parameters = @{} },
    @{ Group = "core"; Effect = "kill_all_enemies"; Parameters = @{} },
    @{ Group = "core"; Effect = "teleport_to_player"; Parameters = @{ partySlot = "party_2" } },
    @{ Group = "core"; Effect = "delete_ground_items"; Parameters = @{} },

    @{ Group = "movement"; Effect = "infinite_jump"; Parameters = @{} },
    @{ Group = "movement"; Effect = "super_jump"; Parameters = @{} },
    @{ Group = "movement"; Effect = "speed_boost"; Parameters = @{} },
    @{ Group = "movement"; Effect = "disable_jumping"; Parameters = @{} },
    @{ Group = "movement"; Effect = "no_gravity"; Parameters = @{} },
    @{ Group = "movement"; Effect = "fast_game_speed"; Parameters = @{} },
    @{ Group = "movement"; Effect = "slow_game_speed"; Parameters = @{} },
    @{ Group = "movement"; Effect = "no_target"; Parameters = @{} },
    @{ Group = "movement"; Effect = "freeze_world"; Parameters = @{} },

    @{ Group = "spawn"; Effect = "spawn_chest"; Parameters = @{ chest = "red_chest" } },
    @{ Group = "spawn"; Effect = "spawn_open_golden_chest"; Parameters = @{} },
    @{ Group = "spawn"; Effect = "spawn_wall"; Parameters = @{} },
    @{ Group = "spawn"; Effect = "spawn_enemy_group"; Parameters = @{ enemy = "badass_axemaul" } },
    @{ Group = "spawn"; Effect = "spawn_enemy_horde"; Parameters = @{ horde = "brute_squad" } },
    @{ Group = "spawn"; Effect = "spawn_badass_enemy"; Parameters = @{ badass = "badass_brute" } },
    @{ Group = "spawn"; Effect = "spawn_boss"; Parameters = @{ boss = "splashzone" } },
    @{ Group = "spawn"; Effect = "barrel_trap"; Parameters = @{} },
    @{ Group = "spawn"; Effect = "barrel_message"; Parameters = @{ message = "VAULT SURGE TEST" } }
)

if ($Group -ne "all") {
    $cases = @($cases | Where-Object { $_.Group -eq $Group })
}

$results = foreach ($case in $cases) {
    $id = "vs-test-$([guid]::NewGuid().ToString('N'))"
    $body = @{
        id = $id
        nonce = [guid]::NewGuid().ToString("N")
        effect_key = $case.Effect
        expires_at = (Get-Date).ToUniversalTime().AddMinutes(2).ToString("o")
        parameters = $case.Parameters
    } | ConvertTo-Json -Depth 5

    $startedAt = Get-Date
    try {
        $queued = Invoke-RestMethod -Method Post -Uri "$BridgeUrl/v1/commands" -Headers $headers -ContentType "application/json" -Body $body -TimeoutSec 10
        if (-not $queued.queued) {
            throw "Bridge did not queue the command."
        }

        $result = $null
        for ($attempt = 0; $attempt -lt 80; $attempt++) {
            Start-Sleep -Milliseconds 250
            try {
                $result = Invoke-RestMethod -Uri "$BridgeUrl/v1/commands/$id" -Headers $headers -TimeoutSec 5
                break
            }
            catch {
                if ($_.Exception.Response.StatusCode.value__ -ne 404) {
                    throw
                }
            }
        }
        if ($null -eq $result) {
            throw "Timed out waiting for the SDK result."
        }

        [pscustomobject]@{
            Effect = $case.Effect
            Ok = [bool]$result.ok
            Milliseconds = [int]((Get-Date) - $startedAt).TotalMilliseconds
            Message = [string]$result.message
        }
    }
    catch {
        [pscustomobject]@{
            Effect = $case.Effect
            Ok = $false
            Milliseconds = [int]((Get-Date) - $startedAt).TotalMilliseconds
            Message = $_.Exception.Message
        }
    }
}

$results | Format-Table -AutoSize -Wrap
if ($results.Where({ -not $_.Ok }).Count -gt 0) {
    exit 1
}
