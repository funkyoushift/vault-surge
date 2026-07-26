# Vault Surge SDK adapter protocol

The companion talks to the SDK mod over loopback HTTP:

- Base URL: `http://127.0.0.1:49775`
- Status: `GET /v1/status`
- Submit: `POST /v1/commands`
- Result: `GET /v1/commands/{id}`

All endpoints except the minimal status endpoint require either:

```text
Authorization: Bearer <bridge token>
```

or:

```text
X-Vault-Surge-Token: <bridge token>
```

The installer generates the token and stores it in
`%LOCALAPPDATA%\VaultSurge\bridge.json`. The Twitch viewer UI never receives it.

## Command body

```json
{
  "id": "command-01K123456789",
  "nonce": "abcdefghijklmnop",
  "effect_key": "super_jump",
  "expires_at": "2026-07-26T08:00:30Z",
  "parameters": {}
}
```

The SDK adapter accepts only its fixed effect registry. It does not accept console
commands, Unreal object paths, actor definitions, currency amounts, movement
values, spawn counts, or effect durations from the caller. Viewer selections are
validated a second time against hardcoded aliases.

## Response lifecycle

Submit returns `202` after validation and game-thread queueing. The companion polls
the result endpoint until it receives the final effect result or its local timeout
expires. Duplicate command IDs or nonces are rejected, and commands may expire no
more than five minutes in the future.
