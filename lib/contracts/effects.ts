export const effectCategories = ["Helpful", "Mischief", "Enemies", "Bosses", "Chaos"] as const;
export type EffectCategory = (typeof effectCategories)[number];
export type RiskLevel = "safe" | "caution" | "dangerous" | "restricted";
export type HookConfidence = "confirmed" | "candidate" | "blocked";
export type GameStateRequirement =
  | "session_active"
  | "player_alive"
  | "player_loaded"
  | "combat_allowed"
  | "world_spawn_allowed";

export interface EffectInputOption {
  value: string;
  label: string;
  description?: string;
}

export type EffectInputDefinition =
  | {
      key: string;
      kind: "select";
      label: string;
      helpText?: string;
      options: readonly EffectInputOption[];
      defaultValue: string;
    }
  | {
      key: string;
      kind: "text";
      label: string;
      helpText?: string;
      placeholder: string;
      maxLength: number;
      maxLines: number;
      allowedPattern: string;
    };

export interface EffectDefinition {
  key: string;
  displayName: string;
  description: string;
  category: EffectCategory;
  riskLevel: RiskLevel;
  hookConfidence: HookConfidence;
  hookNote: string;
  defaultCreditCost: number;
  durationSeconds?: number;
  quantityLimits: { min: number; max: number; maxUsesPerStream: number };
  cooldowns: { globalSeconds: number; perViewerSeconds: number };
  requirements: GameStateRequirement[];
  requiresApproval: boolean;
  enabled: boolean;
  channelPointsEligible: boolean;
  adapterParameters: Readonly<Record<string, string | number | boolean>>;
  inputs?: readonly EffectInputDefinition[];
}

export type EffectViewerParameters = Readonly<Record<string, string>>;
export type EffectInputValidation =
  | { ok: true; parameters: EffectViewerParameters }
  | { ok: false; error: string };

const limits = (maxUsesPerStream = 20) => ({ min: 1, max: 1, maxUsesPerStream });
const requirements = {
  loaded: ["session_active", "player_loaded"] as GameStateRequirement[],
  alive: ["session_active", "player_loaded", "player_alive"] as GameStateRequirement[],
  combat: ["session_active", "player_alive", "combat_allowed", "world_spawn_allowed"] as GameStateRequirement[],
  spawn: ["session_active", "player_loaded", "world_spawn_allowed"] as GameStateRequirement[],
};

const enemyOptions: readonly EffectInputOption[] = [
  { value: "badass_axemaul", label: "Badass Axemaul", description: "A heavy catlike melee threat." },
  { value: "loot_beast", label: "Loot Beast", description: "Danger with a possible payday." },
  { value: "loot_mangler", label: "Loot Mangler", description: "A popular loot-carrying creature." },
  { value: "holey_moley", label: "Holey Moley", description: "A memorable named enemy." },
] as const;

const hordeOptions: readonly EffectInputOption[] = [
  { value: "psycho_mob", label: "Psycho Mob", description: "Six basic psychos." },
  { value: "beast_pack", label: "Savagehorn Pack", description: "Five basic beast enemies." },
  { value: "kratch_swarm", label: "Kratch Swarm", description: "Five basic flying kratch." },
  { value: "brute_squad", label: "Brute Squad", description: "Four basic brute enemies." },
  { value: "mangler_pack", label: "Mangler Pack", description: "Five basic manglers." },
] as const;

const badassOptions: readonly EffectInputOption[] = [
  { value: "badass_axemaul", label: "Badass Axemaul" },
  { value: "badass_brute", label: "Badass Brute" },
  { value: "badass_psycho", label: "Badass Psycho" },
  { value: "bat_mother", label: "Kratch Mother" },
] as const;

const bossOptions: readonly EffectInputOption[] = [
  { value: "splashzone", label: "Splashzone" },
  { value: "idolator_sol", label: "Idolator Sol" },
  { value: "skyspanner_kratch", label: "Skyspanner Kratch" },
  { value: "callis_ripper_queen", label: "Callis the Ripper Queen" },
  { value: "timekeeper", label: "Primordial Guardian Timekeeper" },
  { value: "axemaul", label: "Axemaul" },
  { value: "battlewagon", label: "Battlewagon" },
  { value: "core_observer", label: "Core Observer" },
  { value: "inceptus", label: "Primordial Guardian Inceptus" },
  { value: "origo", label: "Primordial Guardian Origo" },
  { value: "radix", label: "Primordial Guardian Radix" },
  { value: "sludgemaw", label: "Sludgemaw" },
  { value: "crazed_earl", label: "Crazed Earl" },
  { value: "horace", label: "Horace" },
  { value: "oppressor", label: "The Oppressor" },
  { value: "bloomreaper", label: "Bloomreaper" },
  { value: "subjugator_thol", label: "Subjugator and Thol the Invincible" },
] as const;

const partySlotOptions: readonly EffectInputOption[] = [
  { value: "party_2", label: "Player 2" },
  { value: "party_3", label: "Player 3" },
  { value: "party_4", label: "Player 4" },
] as const;

const individualBossSpecs = [
  ["boss_splashzone", "Splashzone", "splashzone", 650],
  ["boss_skyspanner_kratch", "Skyspanner Kratch", "skyspanner_kratch", 700],
  ["boss_callis", "Callis the Ripper Queen", "callis_ripper_queen", 750],
  ["boss_timekeeper", "Primordial Guardian Timekeeper", "timekeeper", 1400],
  ["boss_axemaul", "Axemaul", "axemaul", 800],
  ["boss_battlewagon", "Battlewagon", "battlewagon", 900],
  ["boss_core_observer", "Core Observer", "core_observer", 950],
  ["boss_inceptus", "Primordial Guardian Inceptus", "inceptus", 1200],
  ["boss_origo", "Primordial Guardian Origo", "origo", 1200],
  ["boss_radix", "Primordial Guardian Radix", "radix", 1200],
  ["boss_sludgemaw", "Sludgemaw", "sludgemaw", 700],
  ["boss_horace", "Horace", "horace", 750],
  ["boss_bloomreaper", "Bloomreaper", "bloomreaper", 1100],
  ["boss_subjugator_thol", "Subjugator and Thol the Invincible", "subjugator_thol", 1600],
] as const;

const individualBossEffects: EffectDefinition[] = individualBossSpecs.map(
  ([key, displayName, boss, defaultCreditCost]) => ({
    key,
    displayName,
    description: `Spawn ${displayName} as an immediate hostile encounter.`,
    category: "Bosses",
    riskLevel: "dangerous",
    hookConfidence: "confirmed",
    hookNote: "Confirmed during the BL4 live selector test; priced independently by encounter strength.",
    defaultCreditCost,
    quantityLimits: limits(3),
    cooldowns: { globalSeconds: 90, perViewerSeconds: 240 },
    requirements: requirements.combat,
    requiresApproval: false,
    enabled: true,
    channelPointsEligible: false,
    adapterParameters: { action: "spawn_boss", boss },
  }),
);

export const effectCatalog: readonly EffectDefinition[] = [
  {
    key: "heal_player", displayName: "Health Drop", description: "Drop a health pickup near the selected player.",
    category: "Helpful", riskLevel: "safe", hookConfidence: "candidate", hookNote: "The current health pool failed its live test and needs a verified BL4 recovery-pickup definition.",
    defaultCreditCost: 120, quantityLimits: limits(30), cooldowns: { globalSeconds: 6, perViewerSeconds: 20 },
    requirements: requirements.spawn, requiresApproval: false, enabled: false, channelPointsEligible: true,
    adapterParameters: { action: "spawn_recovery_pickup", pickup: "health", count: 1 },
  },
  {
    key: "add_currency", displayName: "Cash Delivery", description: "Add a fixed bundle of cash to the streamer.",
    category: "Helpful", riskLevel: "safe", hookConfidence: "confirmed", hookNote: "A tested BL4 cash adjustment hook is available.",
    defaultCreditCost: 220, quantityLimits: limits(15), cooldowns: { globalSeconds: 8, perViewerSeconds: 25 },
    requirements: requirements.loaded, requiresApproval: false, enabled: true, channelPointsEligible: true,
    adapterParameters: { action: "adjust_currency", currency: "cash", amount: 2500 },
  },
  {
    key: "add_eridium", displayName: "Eridium Delivery", description: "Add a fixed bundle of Eridium to the streamer.",
    category: "Helpful", riskLevel: "safe", hookConfidence: "confirmed", hookNote: "A tested BL4 Eridium adjustment hook is available.",
    defaultCreditCost: 300, quantityLimits: limits(10), cooldowns: { globalSeconds: 12, perViewerSeconds: 35 },
    requirements: requirements.loaded, requiresApproval: false, enabled: true, channelPointsEligible: true,
    adapterParameters: { action: "adjust_currency", currency: "eridium", amount: 100 },
  },
  {
    key: "remove_currency", displayName: "Cash Tax", description: "Immediately remove $1,500 from the streamer’s carried cash.",
    category: "Mischief", riskLevel: "caution", hookConfidence: "confirmed", hookNote: "The tested BL4 currency hook accepts a signed adjustment.",
    defaultCreditCost: 200, quantityLimits: limits(15), cooldowns: { globalSeconds: 12, perViewerSeconds: 35 },
    requirements: requirements.loaded, requiresApproval: false, enabled: true, channelPointsEligible: false,
    adapterParameters: { action: "adjust_currency", currency: "cash", amount: -1500 },
  },
  {
    key: "spawn_item", displayName: "Mystery Gear Drop", description: "Drop one randomized level-appropriate gun or piece of gear.",
    category: "Helpful", riskLevel: "caution", hookConfidence: "confirmed", hookNote: "A tested BL4 loot-pool spawn hook is available.",
    defaultCreditCost: 350, quantityLimits: limits(10), cooldowns: { globalSeconds: 20, perViewerSeconds: 60 },
    requirements: requirements.spawn, requiresApproval: false, enabled: true, channelPointsEligible: true,
    adapterParameters: { action: "spawn_loot", pool: "guns_and_gear", count: 1 },
  },
  {
    key: "inventory_gear_copy", displayName: "Inventory Encore", description: "Deliver a safe copy of one live weapon or gear item from the streamer’s inventory.",
    category: "Helpful", riskLevel: "safe", hookConfidence: "confirmed", hookNote: "Live-tested with Oak2LiveObjectViewer: reads a real @U inventory serial and delivers the copy through BL4’s reward-package path without native ItemPool calls.",
    defaultCreditCost: 600, quantityLimits: limits(5), cooldowns: { globalSeconds: 60, perViewerSeconds: 180 },
    requirements: requirements.loaded, requiresApproval: false, enabled: false, channelPointsEligible: false,
    adapterParameters: { action: "copy_live_inventory_item", delivery: "reward_package", nativeItemPool: false },
  },
  {
    key: "loot_luck", displayName: "Loot Luck", description: "For 90 seconds, improve the rarity rolls of loot generated by the game.",
    category: "Helpful", riskLevel: "caution", hookConfidence: "confirmed", hookNote: "A tested BL4 rarity modifier and reset are available.",
    defaultCreditCost: 420, durationSeconds: 90, quantityLimits: limits(8), cooldowns: { globalSeconds: 45, perViewerSeconds: 120 },
    requirements: requirements.loaded, requiresApproval: false, enabled: true, channelPointsEligible: true,
    adapterParameters: { action: "rarity_modifier", preset: "lucky" },
  },
  {
    key: "spawn_chest", displayName: "Red Chest", description: "Place a red loot chest near the player.",
    category: "Helpful", riskLevel: "caution", hookConfidence: "candidate", hookNote: "Chest duplication is available but needs a live-template test on each map.",
    defaultCreditCost: 480, quantityLimits: limits(6), cooldowns: { globalSeconds: 30, perViewerSeconds: 90 },
    requirements: requirements.spawn, requiresApproval: false, enabled: false, channelPointsEligible: true,
    adapterParameters: { action: "spawn_chest", chest: "red_chest" },
  },
  {
    key: "spawn_open_golden_chest", displayName: "Golden Chest Surprise", description: "Spawn a golden chest near the player and trigger the known open-chest hook.",
    category: "Helpful", riskLevel: "caution", hookConfidence: "candidate", hookNote: "Both local hooks exist; their timing together needs an in-game test.",
    defaultCreditCost: 700, quantityLimits: limits(4), cooldowns: { globalSeconds: 60, perViewerSeconds: 180 },
    requirements: requirements.spawn, requiresApproval: false, enabled: false, channelPointsEligible: false,
    adapterParameters: { action: "spawn_open_golden_chest" },
  },
  {
    key: "full_ammo", displayName: "Infinite Ammo", description: "Give the streamer unlimited ammunition for 30 seconds.",
    category: "Helpful", riskLevel: "safe", hookConfidence: "confirmed", hookNote: "Uses the tested BL4 Infinite Ammo developer perk and automatically toggles it off.",
    defaultCreditCost: 180, quantityLimits: limits(20), cooldowns: { globalSeconds: 12, perViewerSeconds: 35 },
    requirements: requirements.alive, requiresApproval: false, enabled: true, channelPointsEligible: true,
    adapterParameters: { action: "infinite_ammo", durationSeconds: 30 },
  },
  {
    key: "infinite_jump", displayName: "Moon Boots", description: "Allow unlimited jumps for a short time.",
    category: "Helpful", riskLevel: "caution", hookConfidence: "confirmed", hookNote: "A tested selected-player infinite-jump hook is available.",
    defaultCreditCost: 280, durationSeconds: 30, quantityLimits: limits(12), cooldowns: { globalSeconds: 25, perViewerSeconds: 75 },
    requirements: requirements.alive, requiresApproval: false, enabled: true, channelPointsEligible: true,
    adapterParameters: { action: "infinite_jump", enabled: true },
  },
  {
    key: "super_jump", displayName: "High Jump", description: "Increase jump height for 30 seconds while keeping normal gravity.",
    category: "Helpful", riskLevel: "caution", hookConfidence: "confirmed", hookNote: "A tested high-jump movement preset is available.",
    defaultCreditCost: 250, durationSeconds: 30, quantityLimits: limits(12), cooldowns: { globalSeconds: 25, perViewerSeconds: 75 },
    requirements: requirements.alive, requiresApproval: false, enabled: true, channelPointsEligible: true,
    adapterParameters: { action: "movement_preset", preset: "super_jump" },
  },
  {
    key: "speed_boost", displayName: "Speed Boost", description: "Greatly increase running and walking speed for 30 seconds.",
    category: "Helpful", riskLevel: "caution", hookConfidence: "confirmed", hookNote: "A tested high-speed movement preset is available.",
    defaultCreditCost: 260, durationSeconds: 30, quantityLimits: limits(12), cooldowns: { globalSeconds: 25, perViewerSeconds: 75 },
    requirements: requirements.alive, requiresApproval: false, enabled: true, channelPointsEligible: true,
    adapterParameters: { action: "movement_preset", preset: "speed" },
  },
  {
    key: "spawn_enemy_group", displayName: "Choose an Enemy", description: "Spawn a curated BL4 enemy selected by the viewer.",
    category: "Enemies", riskLevel: "caution", hookConfidence: "confirmed", hookNote: "Only entries that produced active, killable enemies in the live test are viewer-facing.",
    defaultCreditCost: 420, quantityLimits: limits(10), cooldowns: { globalSeconds: 25, perViewerSeconds: 75 },
    requirements: requirements.combat, requiresApproval: false, enabled: true, channelPointsEligible: true,
    adapterParameters: { action: "spawn_enemy", count: 1 },
    inputs: [{ key: "enemy", kind: "select", label: "Enemy", helpText: "Only active, killable BL4 enemies are available.", options: enemyOptions, defaultValue: "badass_axemaul" }],
  },
  {
    key: "spawn_enemy_horde", displayName: "Enemy Horde", description: "Spawn a group of weaker enemies around the streamer.",
    category: "Enemies", riskLevel: "dangerous", hookConfidence: "candidate", hookNote: "Uses repeated verified SpawnAI requests; each group remains viewer-inactive until its actor definitions pass live testing.",
    defaultCreditCost: 550, quantityLimits: limits(6), cooldowns: { globalSeconds: 50, perViewerSeconds: 150 },
    requirements: requirements.combat, requiresApproval: false, enabled: false, channelPointsEligible: false,
    adapterParameters: { action: "spawn_enemy_horde" },
    inputs: [{ key: "horde", kind: "select", label: "Horde", helpText: "Streamer live testing is required before a horde is viewer-enabled.", options: hordeOptions, defaultValue: "beast_pack" }],
  },
  {
    key: "spawn_badass_enemy", displayName: "Choose a Badass", description: "Spawn one stronger enemy selected by the viewer.",
    category: "Enemies", riskLevel: "dangerous", hookConfidence: "candidate", hookNote: "The broken nameplate concept was removed; this now uses a real enemy selector that needs per-entry live verification.",
    defaultCreditCost: 600, quantityLimits: limits(6), cooldowns: { globalSeconds: 60, perViewerSeconds: 180 },
    requirements: requirements.combat, requiresApproval: false, enabled: false, channelPointsEligible: false,
    adapterParameters: { action: "spawn_badass_enemy" },
    inputs: [{ key: "badass", kind: "select", label: "Badass", helpText: "Only active, killable entries will be viewer-enabled after testing.", options: badassOptions, defaultValue: "badass_axemaul" }],
  },
  {
    key: "spawn_boss", displayName: "Choose a Boss", description: "Spawn a curated boss chosen by the viewer.",
    category: "Bosses", riskLevel: "dangerous", hookConfidence: "candidate", hookNote: "Observed MSBT favorites exist, but boss lifecycle and map compatibility require per-entry tests.",
    defaultCreditCost: 900, quantityLimits: limits(3), cooldowns: { globalSeconds: 90, perViewerSeconds: 240 },
    requirements: requirements.combat, requiresApproval: false, enabled: false, channelPointsEligible: false,
    adapterParameters: { action: "spawn_boss" },
    inputs: [{ key: "boss", kind: "select", label: "Boss", helpText: "Entries remain viewer-inactive until their exact BL4 actor definition passes a live spawn test.", options: bossOptions, defaultValue: "battlewagon" }],
  },
  ...individualBossEffects,
  {
    key: "kill_all_enemies", displayName: "Clean Sweep", description: "Defeat loaded hostile enemies using the tested developer perk.",
    category: "Helpful", riskLevel: "dangerous", hookConfidence: "candidate", hookNote: "The developer perk returned success but produced no visible result in the live test.",
    defaultCreditCost: 750, quantityLimits: limits(4), cooldowns: { globalSeconds: 60, perViewerSeconds: 180 },
    requirements: ["session_active", "player_loaded", "combat_allowed"], requiresApproval: false, enabled: false, channelPointsEligible: false,
    adapterParameters: { action: "clear_hostiles" },
  },
  {
    key: "launch_player", displayName: "Air Mail", description: "Launch the streamer vertically with a capped impulse.",
    category: "Mischief", riskLevel: "caution", hookConfidence: "candidate", hookNote: "The catalog concept exists, but the installed BL4 SDK adapter has no verified launch handler.",
    defaultCreditCost: 260, quantityLimits: limits(15), cooldowns: { globalSeconds: 15, perViewerSeconds: 45 },
    requirements: requirements.alive, requiresApproval: false, enabled: false, channelPointsEligible: true,
    adapterParameters: { action: "launch_player", verticalForce: 0.7 },
  },
  {
    key: "teleport_to_player", displayName: "Party Swap", description: "Teleport the streamer to a validated party member.",
    category: "Mischief", riskLevel: "caution", hookConfidence: "confirmed", hookNote: "A tested party-slot teleport with collision restoration is available.",
    defaultCreditCost: 400, quantityLimits: limits(8), cooldowns: { globalSeconds: 35, perViewerSeconds: 100 },
    requirements: requirements.alive, requiresApproval: false, enabled: true, channelPointsEligible: false,
    adapterParameters: { action: "teleport_to_party_slot" },
    inputs: [{ key: "partySlot", kind: "select", label: "Destination", options: partySlotOptions, defaultValue: "party_2" }],
  },
  {
    key: "disable_jumping", displayName: "Grounded", description: "Temporarily prevent the streamer from jumping.",
    category: "Mischief", riskLevel: "caution", hookConfidence: "candidate", hookNote: "Zeroing the known jump fields did not block jumping in the live test; a CanJump gate still needs discovery.",
    defaultCreditCost: 300, durationSeconds: 20, quantityLimits: limits(10), cooldowns: { globalSeconds: 30, perViewerSeconds: 90 },
    requirements: requirements.alive, requiresApproval: false, enabled: false, channelPointsEligible: true,
    adapterParameters: { action: "jump_modifier", enabled: false },
  },
  {
    key: "no_gravity", displayName: "Zero G", description: "Set player gravity to zero for a short burst.",
    category: "Chaos", riskLevel: "dangerous", hookConfidence: "confirmed", hookNote: "A tested BL4 gravity-scale field is available.",
    defaultCreditCost: 380, durationSeconds: 15, quantityLimits: limits(8), cooldowns: { globalSeconds: 35, perViewerSeconds: 100 },
    requirements: requirements.alive, requiresApproval: false, enabled: true, channelPointsEligible: false,
    adapterParameters: { action: "gravity_modifier", scale: 0 },
  },
  {
    key: "fast_game_speed", displayName: "Fast Forward", description: "Speed up the game clock temporarily.",
    category: "Chaos", riskLevel: "dangerous", hookConfidence: "confirmed", hookNote: "A tested world-speed setter and reset are available.",
    defaultCreditCost: 450, durationSeconds: 20, quantityLimits: limits(8), cooldowns: { globalSeconds: 45, perViewerSeconds: 120 },
    requirements: requirements.alive, requiresApproval: false, enabled: true, channelPointsEligible: false,
    adapterParameters: { action: "time_dilation", scale: 1.75 },
  },
  {
    key: "slow_game_speed", displayName: "Bullet Time", description: "Run the entire game at half speed for 20 seconds.",
    category: "Chaos", riskLevel: "caution", hookConfidence: "confirmed", hookNote: "A tested world-speed setter and reset are available.",
    defaultCreditCost: 350, durationSeconds: 20, quantityLimits: limits(8), cooldowns: { globalSeconds: 45, perViewerSeconds: 120 },
    requirements: requirements.alive, requiresApproval: false, enabled: true, channelPointsEligible: true,
    adapterParameters: { action: "time_dilation", scale: 0.5 },
  },
  {
    key: "no_target", displayName: "Ghost Mode", description: "Make players untargetable by enemy AI for 30 seconds.",
    category: "Helpful", riskLevel: "caution", hookConfidence: "confirmed", hookNote: "A tested AI-targetability toggle is available.",
    defaultCreditCost: 500, durationSeconds: 30, quantityLimits: limits(6), cooldowns: { globalSeconds: 60, perViewerSeconds: 150 },
    requirements: requirements.alive, requiresApproval: false, enabled: true, channelPointsEligible: false,
    adapterParameters: { action: "ai_targetable", targetable: false },
  },
  {
    key: "freeze_world", displayName: "Everybody Freeze", description: "Freeze the world while allowing players to move.",
    category: "Chaos", riskLevel: "dangerous", hookConfidence: "confirmed", hookNote: "Verified in a live save: the camera heartbeat restores the world after 12 seconds and continues processing commands.",
    defaultCreditCost: 650, durationSeconds: 12, quantityLimits: limits(5), cooldowns: { globalSeconds: 75, perViewerSeconds: 180 },
    requirements: requirements.alive, requiresApproval: false, enabled: true, channelPointsEligible: false,
    adapterParameters: { action: "players_only_time", enabled: true },
  },
  {
    key: "noclip", displayName: "Phase Walk", description: "Temporarily disable player collision.",
    category: "Chaos", riskLevel: "dangerous", hookConfidence: "confirmed", hookNote: "A tested collision toggle is available; recovery and reset are required.",
    defaultCreditCost: 700, durationSeconds: 10, quantityLimits: limits(4), cooldowns: { globalSeconds: 90, perViewerSeconds: 240 },
    requirements: requirements.alive, requiresApproval: false, enabled: false, channelPointsEligible: false,
    adapterParameters: { action: "noclip", enabled: true },
  },
  {
    key: "barrel_message", displayName: "Barrel Message", description: "Build the viewer’s short message in the world using barrels.",
    category: "Chaos", riskLevel: "dangerous", hookConfidence: "confirmed", hookNote: "A tested BL4 world-logo generator is available.",
    defaultCreditCost: 800, quantityLimits: limits(5), cooldowns: { globalSeconds: 90, perViewerSeconds: 240 },
    requirements: requirements.spawn, requiresApproval: false, enabled: true, channelPointsEligible: false,
    adapterParameters: { action: "world_message", renderer: "barrel_logo", distance: 2500, height: 750, spacing: 70, scale: 0.45 },
    inputs: [{
      key: "message", kind: "text", label: "Your message", placeholder: "HI VAULT HUNTER",
      helpText: "Up to two short lines. Messages are restricted to the server allowlist.",
      maxLength: 32, maxLines: 2, allowedPattern: "^[A-Za-z0-9 .,!?'\\-\\n]+$",
    }],
  },
  {
    key: "barrel_trap", displayName: "Barrel Trap", description: "Spawn eight explosive barrels in front of the streamer.",
    category: "Chaos", riskLevel: "dangerous", hookConfidence: "confirmed", hookNote: "Uses the same allowlisted barrel actor and verified generic-spawn path as Barrel Message.",
    defaultCreditCost: 700, quantityLimits: limits(4), cooldowns: { globalSeconds: 75, perViewerSeconds: 180 },
    requirements: requirements.spawn, requiresApproval: false, enabled: true, channelPointsEligible: false,
    adapterParameters: { action: "spawn_barrel_ring", count: 8 },
  },
  {
    key: "spawn_wall", displayName: "Roadblock", description: "Spawn a breakable barrier directly ahead of the player.",
    category: "Chaos", riskLevel: "dangerous", hookConfidence: "confirmed", hookNote: "The destructible roadblock passed the live in-game test.",
    defaultCreditCost: 500, quantityLimits: limits(5), cooldowns: { globalSeconds: 60, perViewerSeconds: 150 },
    requirements: requirements.spawn, requiresApproval: false, enabled: true, channelPointsEligible: false,
    adapterParameters: { action: "spawn_wall", actor: "IO_DestructibleBarrier_1000x500" },
  },
  {
    key: "empty_ammo", displayName: "Click, Click", description: "Empty the currently held weapon’s ammunition.",
    category: "Mischief", riskLevel: "caution", hookConfidence: "candidate", hookNote: "BL4 weapon resource-pool fields require discovery.",
    defaultCreditCost: 260, quantityLimits: limits(10), cooldowns: { globalSeconds: 30, perViewerSeconds: 90 },
    requirements: requirements.alive, requiresApproval: false, enabled: false, channelPointsEligible: false,
    adapterParameters: { action: "ammo_modifier", mode: "empty_active_weapon" },
  },
  {
    key: "silly_scales", displayName: "Silly Scales", description: "Randomize character scale temporarily.",
    category: "Chaos", riskLevel: "dangerous", hookConfidence: "candidate", hookNote: "Unreal actor scale is available; BL4 collision and replication need testing.",
    defaultCreditCost: 500, durationSeconds: 30, quantityLimits: limits(5), cooldowns: { globalSeconds: 60, perViewerSeconds: 150 },
    requirements: requirements.alive, requiresApproval: false, enabled: false, channelPointsEligible: false,
    adapterParameters: { action: "actor_scale", preset: "random_safe" },
  },
  {
    key: "disable_crouch", displayName: "No Crouching", description: "Temporarily prevent crouching.",
    category: "Mischief", riskLevel: "caution", hookConfidence: "candidate", hookNote: "BL3 resource-lock behavior is known; equivalent BL4 function needs discovery.",
    defaultCreditCost: 260, durationSeconds: 20, quantityLimits: limits(10), cooldowns: { globalSeconds: 30, perViewerSeconds: 90 },
    requirements: requirements.alive, requiresApproval: false, enabled: false, channelPointsEligible: true,
    adapterParameters: { action: "movement_lock", capability: "crouch" },
  },
  {
    key: "disable_mantling", displayName: "No Mantling", description: "Temporarily prevent climbing and mantling.",
    category: "Mischief", riskLevel: "caution", hookConfidence: "candidate", hookNote: "BL3 resource-lock behavior is known; equivalent BL4 function needs discovery.",
    defaultCreditCost: 300, durationSeconds: 20, quantityLimits: limits(10), cooldowns: { globalSeconds: 30, perViewerSeconds: 90 },
    requirements: requirements.alive, requiresApproval: false, enabled: false, channelPointsEligible: true,
    adapterParameters: { action: "movement_lock", capability: "mantle" },
  },
  {
    key: "spawn_vehicle", displayName: "Special Delivery", description: "Spawn a validated vehicle near the player.",
    category: "Helpful", riskLevel: "caution", hookConfidence: "candidate", hookNote: "Actor spawning is available; usable vehicle initialization needs testing.",
    defaultCreditCost: 420, quantityLimits: limits(6), cooldowns: { globalSeconds: 45, perViewerSeconds: 120 },
    requirements: requirements.spawn, requiresApproval: false, enabled: false, channelPointsEligible: false,
    adapterParameters: { action: "spawn_vehicle", vehicle: "last_loadout" },
  },
  {
    key: "reduce_health", displayName: "Health Tax", description: "Reduce player health without killing them.",
    category: "Mischief", riskLevel: "restricted", hookConfidence: "blocked", hookNote: "No dependable BL4 player-health write is known.",
    defaultCreditCost: 180, quantityLimits: limits(0), cooldowns: { globalSeconds: 60, perViewerSeconds: 180 },
    requirements: requirements.alive, requiresApproval: false, enabled: false, channelPointsEligible: false,
    adapterParameters: { action: "restricted_noop" },
  },
  {
    key: "reverse_controls", displayName: "Wrong Way", description: "Reverse movement controls temporarily.",
    category: "Chaos", riskLevel: "restricted", hookConfidence: "blocked", hookNote: "No clean BL4 input inversion hook is known.",
    defaultCreditCost: 600, durationSeconds: 15, quantityLimits: limits(0), cooldowns: { globalSeconds: 3600, perViewerSeconds: 3600 },
    requirements: requirements.alive, requiresApproval: false, enabled: false, channelPointsEligible: false,
    adapterParameters: { action: "restricted_noop" },
  },
  {
    key: "instant_death", displayName: "One-Way Ticket", description: "Immediately down the selected player.",
    category: "Chaos", riskLevel: "restricted", hookConfidence: "blocked", hookNote: "No confirmed BL4 player-kill hook is known.",
    defaultCreditCost: 1000, quantityLimits: limits(0), cooldowns: { globalSeconds: 3600, perViewerSeconds: 3600 },
    requirements: requirements.alive, requiresApproval: false, enabled: false, channelPointsEligible: false,
    adapterParameters: { action: "restricted_noop" },
  },
  {
    key: "delete_ground_items", displayName: "Ground Cleanup", description: "Delete loose items currently lying on the ground.",
    category: "Chaos", riskLevel: "dangerous", hookConfidence: "confirmed", hookNote: "The local MSBT ground-item cleanup hook passed the live test. Deleted ground loot cannot be recovered.",
    defaultCreditCost: 800, quantityLimits: limits(3), cooldowns: { globalSeconds: 120, perViewerSeconds: 300 },
    requirements: requirements.loaded, requiresApproval: false, enabled: true, channelPointsEligible: false,
    adapterParameters: { action: "delete_ground_items" },
  },
] as const;

export const effectByKey = new Map(effectCatalog.map((effect) => [effect.key, effect]));

export function defaultEffectInputs(effect: EffectDefinition): EffectViewerParameters {
  return Object.fromEntries((effect.inputs ?? []).map((input) => [
    input.key,
    input.kind === "select" ? input.defaultValue : effect.key === "barrel_message" ? "TEST MESSAGE" : "",
  ]));
}

export function validateEffectInputs(
  effect: EffectDefinition,
  rawParameters: Readonly<Record<string, string>> = {},
): EffectInputValidation {
  const parameters: Record<string, string> = {};
  for (const input of effect.inputs ?? []) {
    const raw = String(rawParameters[input.key] ?? "");
    if (input.kind === "select") {
      if (!input.options.some((option) => option.value === raw)) {
        return { ok: false, error: `Choose a valid ${input.label.toLowerCase()}.` };
      }
      parameters[input.key] = raw;
      continue;
    }

    const normalized = raw.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim()).join("\n").trim();
    if (!normalized) return { ok: false, error: `${input.label} is required.` };
    if (normalized.length > input.maxLength) {
      return { ok: false, error: `${input.label} must be ${input.maxLength} characters or fewer.` };
    }
    if (normalized.split("\n").length > input.maxLines) {
      return { ok: false, error: `${input.label} can use at most ${input.maxLines} lines.` };
    }
    if (!(new RegExp(input.allowedPattern)).test(normalized)) {
      return { ok: false, error: `${input.label} contains unsupported characters.` };
    }
    parameters[input.key] = normalized;
  }
  return { ok: true, parameters };
}
