"""Strict effect registry. No caller-provided console commands or object paths."""

from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import Any, Callable

EffectResult = dict[str, Any]
ResetCallback = Callable[[], EffectResult]


@dataclass
class PendingReset:
    deadline: float
    callback: ResetCallback
    label: str


_pending_resets: dict[str, PendingReset] = {}
_MESSAGE_ALLOWED = re.compile(r"[^A-Za-z0-9 .,!?'\-:|]")

# These are candidate actor definitions observed in the existing BL4 dev-spawner
# catalog. Twitch keeps the corresponding effects disabled until each entry passes
# an in-game spawn and cleanup test.
ENEMY_ALIASES: dict[str, str] = {
    "badass_axemaul": "Char_CatBadass",
    "loot_beast": "Char_BeastLoot",
    "loot_mangler": "Char_CatLoot",
    "holey_moley": "Char_Phalanx_PlotShatter3_HoleyMoley",
}

HORDE_ALIASES: dict[str, tuple[str, ...]] = {
    "psycho_mob": ("Char_PsychoBasic",) * 6,
    "beast_pack": ("Char_BeastBasic",) * 5,
    "kratch_swarm": ("Char_BatBasic",) * 5,
    "brute_squad": ("Char_BruteBasic",) * 4,
    "mangler_pack": ("Char_CatAdult",) * 5,
}

BADASS_ALIASES: dict[str, str] = {
    "badass_axemaul": "Char_CatBadass",
    "badass_brute": "Char_BruteBadass",
    "badass_psycho": "Char_PsychoBadass",
    "bat_mother": "Char_BatMother",
}

BOSS_ALIASES: dict[str, str | tuple[str, ...]] = {
    "splashzone": "Char_Psycho_PlotGrass1_Boss_GlidePack",
    "idolator_sol": "Char_GrassBoss",
    "skyspanner_kratch": "Char_Bat_PlotMount1_Boss_Matriarch",
    "callis_ripper_queen": "Char_ShatterBoss_Shared",
    "moon_maddened_callis": "Char_ShatterBoss_Elpis",
    "timekeeper": "Char_TkGuard",
    "axemaul": "Char_Cat_Mine_Boss_CityCat",
    "battlewagon": "Char_Beast_Drill_Boss_Battlewagon",
    "core_observer": "Char_Drone_Bunker_Boss_Keeper",
    "inceptus": "Char_GrassGuard",
    "origo": "Char_MountGuard_V02",
    "radix": "Char_ShatterGuard",
    "sludgemaw": "Char_Thresher_SideGrass_Trash",
    "crazed_earl": "Char_CrazyEarl_Boss",
    "horace": "Char_Leader_PlotGrass1_Boss_KOTOLieutenant",
    "oppressor": "Char_GunShip_PlotGrass2a_Boss_MeatPlant",
    "bloomreaper": "Char_CreepRaid1",
    "subjugator_thol": ("Char_UberLeaderP", "Char_UberBigBoss"),
}

BOSS_EFFECT_KEYS: dict[str, str] = {
    "boss_splashzone": "splashzone",
    "boss_skyspanner_kratch": "skyspanner_kratch",
    "boss_callis": "callis_ripper_queen",
    "boss_timekeeper": "timekeeper",
    "boss_axemaul": "axemaul",
    "boss_battlewagon": "battlewagon",
    "boss_core_observer": "core_observer",
    "boss_inceptus": "inceptus",
    "boss_origo": "origo",
    "boss_radix": "radix",
    "boss_sludgemaw": "sludgemaw",
    "boss_horace": "horace",
    "boss_bloomreaper": "bloomreaper",
    "boss_subjugator_thol": "subjugator_thol",
}

CHEST_ALIASES: dict[str, str] = {
    "white_chest": "lootable_whitechest",
    "red_chest": "lootable_redchest",
    "golden_chest": "goldenchest",
}


def _backend() -> Any:
    try:
        from MattsSDKBoostingTools import backend_actions

        return backend_actions
    except Exception as exc:
        raise RuntimeError(
            "MattsSDKBoostingTools is required for the current Vault Surge adapter build."
        ) from exc


def _result(value: Any) -> EffectResult:
    if isinstance(value, dict):
        return dict(value)
    return {"ok": True, "message": str(value)}


def _schedule_reset(family: str, seconds: float, callback: ResetCallback, label: str) -> None:
    # Re-triggering the same family extends it. The newest deadline owns the reset.
    _pending_resets[family] = PendingReset(
        deadline=time.monotonic() + max(1.0, min(float(seconds), 300.0)),
        callback=callback,
        label=label,
    )


def process_resets() -> list[EffectResult]:
    now = time.monotonic()
    due = [key for key, reset in _pending_resets.items() if reset.deadline <= now]
    results: list[EffectResult] = []
    for key in due:
        reset = _pending_resets.pop(key, None)
        if reset is None:
            continue
        try:
            result = _result(reset.callback())
            result["reset"] = reset.label
            results.append(result)
        except Exception as exc:
            results.append({"ok": False, "reset": reset.label, "message": repr(exc)})
    return results


def _refresh(backend: Any) -> None:
    backend.refresh_players()


def _target_streamer(backend: Any) -> EffectResult | None:
    players = backend.refresh_players()
    if not players:
        return {"ok": False, "message": "No party players are available."}
    # MSBT normalizes its argument with ``value or ""``; use the string form
    # so party index zero is not mistaken for an empty selection.
    result = _result(backend.set_target_player("0"))
    if not result.get("ok"):
        return result
    return None


def _currency(kind: str, amount: int) -> EffectResult:
    backend = _backend()
    target_error = _target_streamer(backend)
    if target_error is not None:
        return target_error
    return _result(backend.give_currency(kind, amount))


def _health_drop() -> EffectResult:
    # This item-pool name is present in the tested BL4 pool catalog. The pool
    # itself chooses the recovery pickup; viewers cannot replace the name.
    return _result(_backend().spawn_itempool("itempool_health", 1, 60))


def _mystery_drop() -> EffectResult:
    # This fixed allowlisted pool was observed in the BL4 item-pool catalog and
    # successfully uses MSBT's item-pool spawn path. Viewers cannot supply a pool.
    return _result(_backend().spawn_itempool("ItemPool_Trait_Loot_Guns", 1, 60))


def _inventory_gear_copy() -> EffectResult:
    """Safely deliver a copy of a live weapon/gear serial through BL4 rewards."""
    try:
        from Oak2LiveObjectViewer.gear_builder import spawn_and_deliver
    except Exception:
        return {
            "ok": False,
            "message": (
                "Oak2LiveObjectViewer must be installed and enabled for Inventory Encore."
            ),
        }

    try:
        message = spawn_and_deliver(
            "clone",
            deliver=True,
            allow_native=False,
        )
    except Exception as exc:
        return {
            "ok": False,
            "message": f"Safe live-inventory reward delivery failed: {exc}",
        }
    return {"ok": True, "message": str(message)}


def _infinite_ammo() -> EffectResult:
    backend = _backend()
    result = _result(backend.activate_devperk(5))
    if result.get("ok"):
        _schedule_reset(
            "infinite_ammo",
            30,
            lambda: _result(backend.activate_devperk(5)),
            "infinite ammo",
        )
    return result


def _loot_luck() -> EffectResult:
    backend = _backend()
    result = _result(
        backend.rarity_apply(
            {
                "rarity_common_percent": 25,
                "rarity_uncommon_percent": 45,
                "rarity_rare_percent": 70,
                "rarity_epic_percent": 90,
                "rarity_legendary_percent": 100,
                "rarity_pearlescent_percent": 100,
            }
        )
    )
    if result.get("ok"):
        _schedule_reset(
            "rarity",
            90,
            lambda: _result(backend.rarity_reset()),
            "loot luck",
        )
    return result


def _infinite_jump() -> EffectResult:
    backend = _backend()
    result = _result(backend.movement_infinite_jump_all(True))
    if result.get("ok"):
        _schedule_reset(
            "infinite_jump",
            30,
            lambda: _result(backend.movement_infinite_jump_all(False)),
            "infinite jump",
        )
    return result


def _movement(payload: dict[str, Any], duration: int, label: str) -> EffectResult:
    backend = _backend()
    result = _result(backend.movement_apply_all(payload))
    if result.get("ok"):
        _schedule_reset(
            "movement",
            duration,
            lambda: _result(backend.movement_reset_all()),
            label,
        )
    return result


def _time(scale: float) -> EffectResult:
    backend = _backend()
    result = _result(backend.movement_set_time(scale))
    if result.get("ok"):
        _schedule_reset(
            "time_dilation",
            20,
            lambda: _result(backend.movement_reset_time()),
            "time dilation",
        )
    return result


def _no_target() -> EffectResult:
    from MattsSDKBoostingTools.movement_adjustments import set_no_target

    result = {"ok": True, "message": str(set_no_target(True))}
    _schedule_reset(
        "no_target",
        30,
        lambda: {"ok": True, "message": str(set_no_target(False))},
        "no target",
    )
    return result


def _freeze_world() -> EffectResult:
    backend = _backend()
    result = _result(backend.movement_toggle_players_only())
    if result.get("ok"):
        _schedule_reset(
            "players_only",
            12,
            lambda: _result(backend.movement_toggle_players_only()),
            "players-only freeze",
        )
    return result


def _teleport(parameters: dict[str, str]) -> EffectResult:
    slots = {"party_1": 0, "party_2": 1, "party_3": 2, "party_4": 3}
    requested = str(parameters.get("partySlot") or "party_2")
    if requested not in slots:
        return {"ok": False, "message": "Unsupported party destination."}
    backend = _backend()
    target_error = _target_streamer(backend)
    if target_error is not None:
        return target_error
    return _result(backend.movement_teleport_selected_to_slot(slots[requested]))


def _asd_spawned_count() -> int:
    """Return ActorScriptDeployer's tracked spawn count when available."""
    try:
        import ActorScriptDeployer as asd

        return len(getattr(asd, "_SPAWNED", ()))
    except Exception:
        return -1


def _disable_new_spawn_sources(start_index: int) -> None:
    """Prevent temporary OakSpawners from replaying their actors on later resets."""
    if start_index < 0:
        return
    try:
        import ActorScriptDeployer as asd

        for deployed in tuple(getattr(asd, "_SPAWNED", ()))[start_index:]:
            source = getattr(deployed, "source", None)
            if source is None or not hasattr(source, "GetSpawnerComponent"):
                continue
            try:
                component = source.GetSpawnerComponent()
                component.SetSpawnerEnabled(False)
                component.SetSpawnPointEnabled(False)
            except Exception:
                # The spawned combat actor is already verified; failure to retire
                # its throwaway source should not convert the command to failure.
                pass
    except Exception:
        pass


def _verified_spawner_action(
    action: str,
    payload: dict[str, object],
    label: str,
) -> EffectResult:
    """Reject adapter acknowledgements that did not create a verified actor."""
    before = _asd_spawned_count()
    result = _result(_backend().run_dev_spawner_action(action, payload))
    after = _asd_spawned_count()

    if not result.get("ok", False):
        return result
    if result.get("resolved") is False:
        return {
            "ok": False,
            "message": (
                f"{label} is not loaded as a real actor definition in this map. "
                "The unresolved NPC shell was rejected."
            ),
        }
    if (
        result.get("spawn_verified") is True
        or result.get("verification_status") == "verified_spawned"
        or (before >= 0 and after > before)
    ):
        _disable_new_spawn_sources(before)
        return result

    detail = str(result.get("message") or "").strip()
    return {
        "ok": False,
        "message": (
            f"{label} was accepted by the spawner, but no spawned actor was verified."
            + (f" {detail}" if detail else "")
        ),
    }


def _spawn_from_tracked_actor(
    actor_name: str,
    *,
    distance: float,
    z_offset: float,
    scale: float,
) -> EffectResult:
    """Reuse a verified ASD actor when its original map template is no longer listed."""
    try:
        import ActorScriptDeployer as asd

        tracked = next(
            (
                item
                for item in reversed(getattr(asd, "_SPAWNED", ()))
                if str(getattr(item, "label", "")).lower() == actor_name.lower()
            ),
            None,
        )
        if tracked is None:
            return {"ok": False, "message": "No verified prior actor is available to reuse."}

        source = getattr(tracked, "actor", None)
        _, pawn, world, game_state = asd._spawn_context()
        if source is None or pawn is None or world is None or game_state is None:
            return {"ok": False, "message": "The prior actor is no longer usable in this world."}

        class_name = str(getattr(tracked, "class_name", "") or "")
        actor_class = asd._source_class(source, class_name or None)
        transform = asd._spawn_transform_for_index(
            pawn,
            index=0,
            count=1,
            distance=distance,
            spacing=125,
            z_offset=z_offset,
            scale=scale,
        )
        actor = asd._spawn_actor_deferred(
            game_state,
            world,
            actor_class,
            transform,
            class_name=class_name or None,
            source=source,
            collision_handling=1,
        )
        if actor is None:
            return {"ok": False, "message": "The verified prior actor could not be duplicated."}

        asd._SPAWNED.append(
            asd.DeployedActor(
                label=actor_name,
                source=source,
                actor=actor,
                actor_key=asd._actor_key(actor),
                class_name=asd._class_name(actor),
            )
        )
        return {"ok": True, "message": f"Spawned {actor_name} from a verified session template."}
    except Exception as exc:
        return {"ok": False, "message": f"Verified actor reuse failed: {exc}"}


def _spawn_ai(
    parameters: dict[str, str],
    aliases: dict[str, str | tuple[str, ...]],
    parameter: str,
) -> EffectResult:
    requested = str(parameters.get(parameter) or "")
    actor_defs = aliases.get(requested)
    if actor_defs is None:
        return {"ok": False, "message": f"Unsupported {parameter} selection."}
    definitions = (actor_defs,) if isinstance(actor_defs, str) else actor_defs
    results: list[EffectResult] = []
    for index, actor_def in enumerate(definitions):
        results.append(
            _verified_spawner_action(
                "dev_spawner_spawnai",
                {
                    "dev_ai_name": actor_def,
                    "dev_ai_count": 1,
                    "dev_ai_distance": 600 + (index * 250),
                    "dev_ai_spacing": 125,
                    "dev_ai_scale": 1,
                    "dev_ai_z_offset": 0,
                    # Prefer ActorScriptDeployer's cached/live actor definition
                    # path. Its direct shell fallback can produce a visible pawn
                    # without a real combat actor definition.
                    "dev_ai_direct_only": False,
                },
                f"Enemy {actor_def}",
            )
        )
    return {
        "ok": all(bool(result.get("ok", False)) for result in results),
        "message": " ".join(str(result.get("message", "")) for result in results).strip(),
    }


def _spawn_chest(parameters: dict[str, str]) -> EffectResult:
    requested = str(parameters.get("chest") or "red_chest")
    actor_name = CHEST_ALIASES.get(requested)
    if actor_name is None:
        return {"ok": False, "message": "Unsupported chest selection."}
    spawned = _verified_spawner_action(
        "dev_spawner_spawn",
        {
            "dev_actor_name": actor_name,
            "dev_actor_count": 1,
            "dev_actor_distance": 350,
            "dev_actor_spacing": 125,
            "dev_actor_scale": 1,
            "dev_actor_z_offset": -100,
        },
        f"Chest {actor_name}",
    )
    if spawned.get("ok", False):
        return spawned
    reused = _spawn_from_tracked_actor(
        actor_name,
        distance=350,
        z_offset=-100,
        scale=1,
    )
    return reused if reused.get("ok", False) else spawned


def _spawn_and_open_golden_chest() -> EffectResult:
    spawned = _spawn_chest({"chest": "golden_chest"})
    if not spawned.get("ok", False):
        return spawned
    opened = _result(_backend().open_golden_chest())
    return {
        "ok": bool(opened.get("ok", False)),
        "message": (
            f"{spawned.get('message', 'Golden chest spawned')} "
            f"{opened.get('message', 'Golden chest open hook triggered')}"
        ).strip(),
    }


def _spawn_wall() -> EffectResult:
    return _verified_spawner_action(
        "dev_spawner_spawnai",
        {
            "dev_ai_name": "IO_DestructibleBarrier_1000x500",
            "dev_ai_count": 1,
            "dev_ai_distance": 500,
            "dev_ai_spacing": 125,
            "dev_ai_scale": 1,
            "dev_ai_z_offset": 0,
            "dev_ai_direct_only": True,
        },
        "Road block",
    )


def _barrel_trap() -> EffectResult:
    return _verified_spawner_action(
        "dev_spawner_spawn",
        {
            "dev_actor_name": "barrel",
            "dev_actor_count": 8,
            "dev_actor_distance": 300,
            "dev_actor_spacing": 110,
            "dev_actor_scale": 1,
            "dev_actor_z_offset": -100,
        },
        "Barrel trap",
    )


def _has_tracked_barrel() -> bool:
    try:
        import ActorScriptDeployer as asd

        return any(
            str(getattr(item, "label", "")).lower() == "barrel"
            and getattr(item, "actor", None) is not None
            for item in getattr(asd, "_SPAWNED", ())
        )
    except Exception:
        return False


def _barrel_message(parameters: dict[str, str]) -> EffectResult:
    raw = str(parameters.get("message") or "").strip().replace("\r", " ").replace("\n", "|")
    text = _MESSAGE_ALLOWED.sub("", raw)[:72].strip(" |")
    if not text:
        return {"ok": False, "message": "Message is empty after safety filtering."}
    if not _has_tracked_barrel():
        bootstrap = _verified_spawner_action(
            "dev_spawner_spawn",
            {
                "dev_actor_name": "barrel",
                "dev_actor_count": 1,
                "dev_actor_distance": 350,
                "dev_actor_spacing": 125,
                "dev_actor_scale": 1,
                "dev_actor_z_offset": -100,
            },
            "Barrel template",
        )
        if not bootstrap.get("ok", False):
            return bootstrap
    return _verified_spawner_action(
        "dev_spawner_barrel_logo",
        {
            "dev_logo_text": text,
            "dev_logo_actor": "barrel",
            "dev_logo_distance": 2500,
            "dev_logo_height": 750,
            "dev_logo_spacing": 70,
            "dev_logo_scale": 0.45,
        },
        "Barrel message",
    )


def execute(effect_key: str, parameters: dict[str, str]) -> EffectResult:
    individual_boss = BOSS_EFFECT_KEYS.get(effect_key)
    if individual_boss is not None:
        return _spawn_ai({"boss": individual_boss}, BOSS_ALIASES, "boss")

    handlers: dict[str, Callable[[], EffectResult]] = {
        "heal_player": _health_drop,
        "add_currency": lambda: _currency("cash", 2500),
        "add_eridium": lambda: _currency("eridium", 100),
        "remove_currency": lambda: _currency("cash", -1500),
        "spawn_item": _mystery_drop,
        "inventory_gear_copy": _inventory_gear_copy,
        "loot_luck": _loot_luck,
        "full_ammo": _infinite_ammo,
        "infinite_jump": _infinite_jump,
        "super_jump": lambda: _movement(
            {
                "movement_jump_height": 1200,
                "movement_jump_velocity": 1200,
                "movement_gravity_scale": 1,
            },
            30,
            "super jump",
        ),
        "speed_boost": lambda: _movement(
            {"movement_speed_scale": 5, "movement_walk_speed": 3200},
            30,
            "speed boost",
        ),
        "disable_jumping": lambda: _movement(
            {"movement_jump_height": 0, "movement_jump_velocity": 0},
            20,
            "disabled jumping",
        ),
        "no_gravity": lambda: _movement({"movement_gravity_scale": 0}, 15, "zero gravity"),
        "fast_game_speed": lambda: _time(1.75),
        "slow_game_speed": lambda: _time(0.5),
        "no_target": _no_target,
        "freeze_world": _freeze_world,
        "kill_all_enemies": lambda: _result(_backend().activate_devperk(3)),
        "teleport_to_player": lambda: _teleport(parameters),
        "spawn_chest": lambda: _spawn_chest(parameters),
        "spawn_open_golden_chest": _spawn_and_open_golden_chest,
        "spawn_wall": _spawn_wall,
        "spawn_enemy_group": lambda: _spawn_ai(parameters, ENEMY_ALIASES, "enemy"),
        "spawn_enemy_horde": lambda: _spawn_ai(parameters, HORDE_ALIASES, "horde"),
        "spawn_badass_enemy": lambda: _spawn_ai(parameters, BADASS_ALIASES, "badass"),
        "spawn_boss": lambda: _spawn_ai(parameters, BOSS_ALIASES, "boss"),
        "barrel_trap": _barrel_trap,
        "barrel_message": lambda: _barrel_message(parameters),
        "delete_ground_items": lambda: _result(_backend().movement_delete_ground_items()),
    }
    handler = handlers.get(effect_key)
    if handler is None:
        return {"ok": False, "message": f"Effect is not supported by this SDK build: {effect_key}"}
    try:
        return handler()
    except Exception as exc:
        return {"ok": False, "message": repr(exc)}


def supported_effects() -> list[str]:
    # This list is intentionally explicit and mirrors execute's allowlist.
    return [
        "heal_player",
        "add_currency",
        "add_eridium",
        "remove_currency",
        "spawn_item",
        "inventory_gear_copy",
        "loot_luck",
        "full_ammo",
        "infinite_jump",
        "super_jump",
        "speed_boost",
        "disable_jumping",
        "no_gravity",
        "fast_game_speed",
        "slow_game_speed",
        "no_target",
        "freeze_world",
        "kill_all_enemies",
        "teleport_to_player",
        "spawn_chest",
        "spawn_open_golden_chest",
        "spawn_wall",
        "spawn_enemy_group",
        "spawn_enemy_horde",
        "spawn_badass_enemy",
        "spawn_boss",
        *BOSS_EFFECT_KEYS.keys(),
        "barrel_trap",
        "barrel_message",
        "delete_ground_items",
    ]
