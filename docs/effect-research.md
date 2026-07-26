# Vault Surge effect research

This is an independent behavior inventory. The Borderlands 3 Crowd Control menu was consulted only for effect ideas; no code, identifiers, UI, or assets are copied.

## Implemented in the current test catalog

- Live Test exposes every server-catalog effect, including viewer-inactive and restricted test entries.
- Enabled viewer effects dispatch automatically. The approval queue remains available for inactive development candidates.
- Red Chest replaces the generic chest selector.
- Golden Chest Surprise spawns a golden chest and triggers the known local open-golden-chest hook.
- Ground Cleanup calls the confirmed local ground-item cleanup hook. It remains restricted and disabled by default because deleted loot cannot be recovered.
- Roadblock spawns the observed `IO_DestructibleBarrier_1000x500` candidate and remains viewer-inactive until placement and cleanup are tested.
- The requested named boss selector entries are mapped to actor definitions observed in the local BL4 Dev Spawner catalog.

## BL3-inspired candidates worth pursuing

### Strong candidates with adjacent BL4 hooks

- Full ammo and empty active weapon.
- Disable crouch and disable mantling.
- Launch player with a capped vertical impulse and an automatic recovery reset.
- Random safe player scale.
- Spawn a usable vehicle.
- Barrel ring or barrel rain with strict count and cleanup caps.
- Ratch-style swarm using a curated BL4 creature group.
- “Oops, all psychos” using a capped curated psycho wave.
- Temporary loot-quality boost.

### Extension-only surprises

These do not need a Borderlands SDK hook and can be rendered in the Twitch video component:

- Brief color tint or monochrome filter.
- Screen dim, flash, static, scanlines, or glitch burst.
- Fake low-ammo, critical-health, or connection-warning card clearly branded as a Vault Surge effect.
- Confetti, slime, snow, or sparks over the video.
- Short streamer-approved sound stingers such as crowd cheer, crowd boo, sad trombone, or alarm.
- Viewer message card as a safer alternative to an in-world barrel message.

### High-risk or unverified ideas

- One health, one-shot mode, fall-damage changes, and instant death.
- Drop held weapon, drop shield, drop inventory, or clutter inventory.
- Reset skill trees.
- Hide weapons.
- Reverse controls.
- Disable splash damage.
- Vendor box or arbitrary mission-object spawning.

These stay out of the active catalog until a reversible BL4 hook and a dependable reset path are proven.

## Recommended next test order

1. Red Chest.
2. Golden Chest Surprise.
3. Roadblock placement and cleanup.
4. Ground Cleanup with disposable test loot only.
5. One requested boss at a time, beginning with Battlewagon and the four Primordial Guardians.
6. Add extension-only visual surprises while deeper BL4 hooks are researched.
