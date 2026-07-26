# AGENTS.md

## Project scope

Vault Surge is an independent Twitch viewer-interaction platform. Keep it separate from MSBT and from any Borderlands SDK mod repository.

## Architecture boundary

Maintain this dependency direction:

```text
Twitch Extension UI
→ Extension Backend Service
→ signed, idempotent command queue
→ streamer companion
→ game-neutral adapter protocol
→ game-specific SDK mod
```

Viewer and broadcaster frontends may depend on shared contracts, but must never depend on Borderlands, UnrealSDK, MSBT, Pyrex’s mod, or Crowd Control. Game-specific code belongs behind the adapter protocol.

The server-defined effect catalog is authoritative. Never accept arbitrary effect names, console commands, actor paths, class names, or SDK arguments from a viewer. Commands require unique IDs and must be designed for idempotency, timestamp/expiry validation, nonce replay protection, and signatures. Prices and balances are server-authoritative in production. Never ship Twitch secrets to a frontend.

## Licensing boundary

The BL3 Crowd Control mod declares GPLv3. It may be consulted only to understand observable effect behavior, lifecycle concepts, and protocol requirements. Do not copy its code, distinctive structure, comments, identifiers, branding, proprietary UI, fonts, artwork, or assets. Implement all behavior independently.

## Milestone 1 constraints

This repository currently targets a polished local-only prototype:

- Use simulated viewer identity, credits, Bits, subscriptions, and Channel Points.
- Use the mock game adapter; do not require Borderlands.
- Persist prototype settings only in local browser storage.
- Do not deploy, create cloud resources, create a GitHub repository, or push.
- Permanent loot deletion and inventory destruction stay restricted and disabled by default.

## Validation

Before handing off changes, run type checks, lint, the production build, and available tests. Do not commit secrets. Keep `.env.example` placeholder-only.
