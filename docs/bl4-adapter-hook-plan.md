# BL4 adapter hook plan

This is an implementation handoff for a future game-specific adapter. It is not
loaded by the viewer, broadcaster, backend contract, or mock adapter.

The public catalog sends only stable aliases. The BL4 adapter owns every SDK
identifier and must reject values that are absent from these allowlists.

## Confirmed effect routes

| Effect action | BL4 route | Cleanup requirement |
| --- | --- | --- |
| `spawn_recovery_pickup` | `spawn_itempool("itempool_health", count, level)` | Track spawned pickup when possible |
| `adjust_currency` | `give_currency("cash" | "eridium", signedAmount)` | Clamp server-defined amount |
| `spawn_loot` | `spawn_itempool(allowlistedPool, count, level)` | Clamp count and level |
| `rarity_modifier` | `rarity_apply(...)` | Always call `rarity_reset()` |
| `infinite_jump` | `movement_infinite_jump_set_selected(target, enabled)` | Explicitly set false |
| `movement_preset` | movement preset/apply route | Snapshot and restore prior movement values |
| `clear_hostiles` | `activate_devperk(3)` | Instant action |
| `launch_player` | capped `OakCharacterMovement.AddImpulse` route | Clamp impulse |
| `teleport_to_party_slot` | `movement_teleport_selected_to_slot(0..3)` | Validate destination exists |
| `jump_modifier` | set jump goal, sprint/double/slide goals, and velocity to `0` | Restore exact snapshot |
| `gravity_modifier` | movement gravity scale | Restore exact snapshot |
| `time_dilation` | `movement_set_time(scale)` | `movement_reset_time()` |
| `ai_targetable` | no-target setter | Explicitly restore targetability |
| `players_only_time` | players-only world toggle | Guaranteed untoggle |
| `noclip` | noclip setter | Disable and recover player position |
| `world_message` | `run_dev_spawner_action("dev_spawner_barrel_logo", payload)` | Track generated actors and clear only those actors |

The barrel-message payload uses fixed adapter-owned values:

```text
dev_logo_actor = barrel
dev_logo_distance = 2500
dev_logo_height = 750
dev_logo_spacing = 70
dev_logo_scale = 0.45
dev_logo_include_non_generated = false
```

Only the validated `message` field crosses into `dev_logo_text`. Keep streamer
approval mandatory. Current catalog limits are 32 characters, two lines, and a
small printable-character allowlist.

## Enemy aliases

These aliases map to entries found in the observed-working MSBT favorites. They
remain disabled in the public catalog until a live spawn, hostility, cleanup,
and replication smoke test passes.

| Public alias | BL4 actor definition |
| --- | --- |
| `walking_psycho` | `Char_Psycho_PBJ` |
| `badass_savagehorn` | `Char_BeastBadass` |
| `badass_axemaul` | `Char_CatBadass` |
| `loot_beast` | `Char_BeastLoot` |
| `loot_mangler` | `Char_CatLoot` |
| `holey_moley` | `Char_Phalanx_PlotShatter3_HoleyMoley` |
| `wreck_ogre` | `Char_PhalanxWreck` |

## Boss aliases

| Public alias | BL4 actor definition |
| --- | --- |
| `spider_queen` | `Char_ShatterBoss_Elpis` |
| `tidebreaker` | `Char_MutantFish` |
| `arjay` | `Char_PrisonBuddyBoss_Runnable` |
| `battlewagon` | `Char_Beast_Drill_Boss_Battlewagon_TRUE` |
| `bloomreaper` | `Char_CreepRaid1_TRUE` |
| `backhive` | `Char_Beast_Mine_Boss_Backhive_TRUE` |

## Chest aliases

Chest duplication requires a compatible live template. Keep these disabled
until each target map is tested.

| Public alias | BL4 template |
| --- | --- |
| `white_chest` | `Lootable_WhiteChest_SHARED` |
| `red_chest` | `Lootable_RedChest_SHARED` |
| `golden_chest` | `Lootable_GoldenChest` |

## Candidate discovery queue

The catalog includes disabled candidates for ammo refill/empty, named viewer
badass, barrel trap, character scale, crouch lock, mantle lock, and usable
vehicle spawning. Their behavior is understood from BL3 or generic Unreal
paths, but no dependable BL4 hook has passed a live test yet.

Blocked effects remain reduce health, reverse controls, and instant player
death. Permanent ground-loot deletion remains restricted even though a hook
exists.
