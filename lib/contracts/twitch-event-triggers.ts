export const twitchEventTriggerKeys = [
  "follow",
  "subscription",
  "raid",
  "hype_train",
] as const;

export type TwitchEventTriggerKey = (typeof twitchEventTriggerKeys)[number];

export interface TwitchEventTriggerSetting {
  enabled: boolean;
  effectKey: string;
  minimumValue: number;
  cooldownSeconds: number;
  maxUsesPerStream: number;
}

export interface TwitchEventTriggerDefinition {
  key: TwitchEventTriggerKey;
  label: string;
  eventSubType: string;
  eventSubVersion: string;
  requiredScope: string;
  minimumLabel: string;
  defaultSetting: TwitchEventTriggerSetting;
  note: string;
}

export const twitchEventTriggerDefinitions: readonly TwitchEventTriggerDefinition[] = [
  {
    key: "follow",
    label: "New follow",
    eventSubType: "channel.follow",
    eventSubVersion: "2",
    requiredScope: "moderator:read:followers",
    minimumLabel: "Followers",
    defaultSetting: {
      enabled: false,
      effectKey: "heal_player",
      minimumValue: 1,
      cooldownSeconds: 15,
      maxUsesPerStream: 20,
    },
    note: "Suggested start: drop health for a new follower.",
  },
  {
    key: "subscription",
    label: "New subscription",
    eventSubType: "channel.subscribe",
    eventSubVersion: "1",
    requiredScope: "channel:read:subscriptions",
    minimumLabel: "Tier",
    defaultSetting: {
      enabled: false,
      effectKey: "spawn_chest",
      minimumValue: 1,
      cooldownSeconds: 30,
      maxUsesPerStream: 12,
    },
    note: "Suggested start: spawn a red chest for a new subscription.",
  },
  {
    key: "raid",
    label: "Incoming raid",
    eventSubType: "channel.raid",
    eventSubVersion: "1",
    requiredScope: "None",
    minimumLabel: "Raid viewers",
    defaultSetting: {
      enabled: false,
      effectKey: "spawn_enemy_group",
      minimumValue: 5,
      cooldownSeconds: 120,
      maxUsesPerStream: 5,
    },
    note: "Suggested start: spawn one curated enemy for raids of five or more viewers.",
  },
  {
    key: "hype_train",
    label: "Hype Train begins",
    eventSubType: "channel.hype_train.begin",
    eventSubVersion: "2",
    requiredScope: "channel:read:hype_train",
    minimumLabel: "Level",
    defaultSetting: {
      enabled: false,
      effectKey: "speed_boost",
      minimumValue: 1,
      cooldownSeconds: 300,
      maxUsesPerStream: 3,
    },
    note: "Suggested start: trigger Overdrive once when a Hype Train begins.",
  },
] as const;

export const defaultTwitchEventTriggers: Record<TwitchEventTriggerKey, TwitchEventTriggerSetting> =
  Object.fromEntries(
    twitchEventTriggerDefinitions.map((definition) => [
      definition.key,
      { ...definition.defaultSetting },
    ]),
  ) as Record<TwitchEventTriggerKey, TwitchEventTriggerSetting>;
