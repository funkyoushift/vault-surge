# Vault Surge

Vault Surge has three deliberate boundaries:

1. A static Twitch video component viewers use.
2. An Extension Backend Service (EBS) that verifies Twitch identity and creates
   authoritative, signed commands.
3. A locally installed streamer companion that owns settings, approvals, and
   the game adapter.

The streamer UI still offers its deterministic mock adapter for safe testing.
The first separate BL4 SDK adapter is now packaged for game-side integration.

## What works

- A separately built Twitch component with JWT authorization, a viewer-safe
  catalog, catalog-defined inputs, confirmations, and queue feedback.
- A streamer-only local companion with effect settings, approvals, emergency
  pause, test mode, and command lifecycle history.
- An EBS boundary that verifies Twitch JWTs, removes restricted/disabled
  effects, validates viewer inputs, enforces cooldowns, adds authoritative
  prices/adapter parameters, and signs expiring commands.
- Curated enemy, boss, chest, party-slot, and Barrel Message inputs.
- A game-neutral adapter contract and mock success, retryable, and failure
  outcomes.
- Broadcaster OAuth, encrypted local token sessions, and EventSub signature
  verification foundations.

## Run locally

Requirements: Node.js 22.13 or newer and the trusted certificate described in
`docs/twitch-api-setup.md`.

Run the companion/EBS:

```powershell
npm install
npm run dev
```

Run the Twitch Extension assets in a second PowerShell window:

```powershell
npm run extension:serve
```

The companion runs at `https://localhost:3000`; the Extension runs at
`https://localhost:8081`.

On Windows, double-click `Launch Vault Surge.cmd` to start the companion/EBS,
the Twitch component server, the signed-command worker, and the companion
interface. Double-click `Create Desktop Shortcut.cmd` once to add a Vault Surge
launcher to the desktop. These local launchers are the immediate development
milestone; the distributable installer will bundle the runtime so streamers do
not need Node.js or this source folder.

Build the Borderlands 4 game-side package with:

```powershell
npm.cmd run sdkmod:build
```

The installer-ready artifact is `build\sdk-mod\VaultSurge.sdkmod`. The development
installer step is `scripts\install-sdk-mod.ps1`; it verifies the required Oak2
dependencies before copying the package into Borderlands 4.

Validation:

```powershell
npm run typecheck
npm run lint
npm test
```

## Architecture

```text
Twitch static viewer component (port 8081)
          |
          v
Extension backend service (port 3000)
  JWT verification | catalog validation | cooldowns
          |
          v
Signed, expiring command queue
          |
          v
Installed streamer companion + signature-verifying queue worker
          |
          v
GameAdapter contract
          |
          v
Mock adapter for UI tests | authenticated BL4 SDK adapter on 127.0.0.1:49775
```

Important boundaries:

- `extension/`: Twitch-hosted viewer and setup-help pages.
- `extension-dist/`: upload-ready output from `npm run extension:build`.
- `components/broadcaster-config.tsx`: local streamer settings.
- `components/session-dashboard.tsx`: local session control.
- `lib/backend/command-queue.ts`: signed local queue boundary.
- `scripts/companion-worker.mjs`: verifies signed queue entries and dispatches
  approved effects to the authenticated SDK bridge.
- `lib/contracts/`: authoritative schemas and safe public catalog projection.
- `lib/adapter/`: game-neutral adapter interface and mock implementation.
- `sdk-mod/VaultSurge/`: game-specific BL4 adapter, strict effect allowlist, and
  authenticated loopback bridge.

The Extension sends only a catalog key and catalog-defined viewer inputs. The
EBS independently supplies price, adapter parameters, timestamps, expiry,
nonce, and signature. Arbitrary commands, actor paths, and SDK arguments are
never accepted from viewers.

## Twitch and monetization constraints

- Twitch and command-signing secrets remain server-side.
- Bits require verified Extension transaction receipts before command creation.
- Channel Points require Vault Surge-owned rewards and EventSub redemptions;
  Vault Surge cannot spend a viewer's general points balance.
- Current credits and monetization labels are development simulation only.
- The Twitch Config page is setup help only. All real settings live in the
  installed companion. Viewers install nothing.

## Licensing boundary

The Borderlands 3 Crowd Control mod may be studied only for behavior and
lifecycle understanding. Its GPLv3 source, branding, assets, UI, fonts, and
layout are not copied. Vault Surge is independently authored.

## Next milestone

Move the in-memory queue to durable idempotency storage, replace the prototype
companion bearer token with one-time local pairing, connect the session
dashboard to queue polling, and then add the separately developed BL4 adapter.
