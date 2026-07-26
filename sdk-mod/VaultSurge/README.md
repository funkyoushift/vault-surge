# Vault Surge SDK Adapter

This Oak2 SDK mod is the game-specific end of Vault Surge. It listens only on
`127.0.0.1:49775`, requires the installer-generated pairing token, rejects replayed
or expired commands, and maps a fixed effect allowlist to known BL4 hooks.

Current development dependencies:

- Oak2 Mod Manager / OpenHotfixLoader
- `mods_base`
- `MattsSDKBoostingTools`
- `ActorScriptDeployer` for chest, enemy, boss, and barrel-logo spawns

The installer must generate:

`%LOCALAPPDATA%\VaultSurge\bridge.json`

```json
{
  "bridge_token": "a-long-random-value"
}
```

The same value is stored securely for the local companion. It is never sent to
the Twitch Extension frontend.
