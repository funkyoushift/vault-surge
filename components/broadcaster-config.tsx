"use client";

import { useMemo, useState } from "react";
import type { AdapterHealth } from "../lib/adapter/game-adapter";
import type { EffectDefinition } from "../lib/contracts/effects";
import {
  twitchEventTriggerDefinitions,
  type TwitchEventTriggerKey,
  type TwitchEventTriggerSetting,
} from "../lib/contracts/twitch-event-triggers";
import { TwitchConnection } from "./twitch-connection";

export interface EffectSetting {
  enabled: boolean;
  cost: number;
  channelPointsEligible: boolean;
  requiresApproval: boolean;
  maxUsesPerStream: number;
}

export interface PrototypeSettings {
  globalCooldownSeconds: number;
  perViewerCooldownSeconds: number;
  effects: Record<string, EffectSetting>;
  eventTriggers: Record<TwitchEventTriggerKey, TwitchEventTriggerSetting>;
}

interface Props {
  catalog: readonly EffectDefinition[];
  settings: PrototypeSettings;
  adapterHealth: AdapterHealth;
  onSave: (settings: PrototypeSettings) => void;
}

function defaultEffectSetting(effect: EffectDefinition): EffectSetting {
  return {
    enabled: effect.enabled,
    cost: effect.defaultCreditCost,
    channelPointsEligible: effect.channelPointsEligible,
    requiresApproval: false,
    maxUsesPerStream: effect.quantityLimits.maxUsesPerStream,
  };
}

export function BroadcasterConfig({ catalog, settings, adapterHealth, onSave }: Props) {
  const [draft, setDraft] = useState(settings);
  const [saved, setSaved] = useState(false);

  const dangerousCount = useMemo(
    () => catalog.filter((effect) => effect.riskLevel === "dangerous" && draft.effects[effect.key]?.enabled).length,
    [catalog, draft],
  );

  const updateEffect = (key: string, patch: Partial<EffectSetting>) => {
    const effect = catalog.find((item) => item.key === key);
    if (!effect) return;
    setSaved(false);
    setDraft((current) => ({
      ...current,
      effects: {
        ...current.effects,
        [key]: { ...(current.effects[key] ?? defaultEffectSetting(effect)), ...patch },
      },
    }));
  };

  const setBooleanColumn = (
    field: "enabled" | "channelPointsEligible" | "requiresApproval",
    value: boolean,
  ) => {
    setSaved(false);
    setDraft((current) => ({
      ...current,
      effects: Object.fromEntries(catalog.map((effect) => {
        const row = current.effects[effect.key] ?? defaultEffectSetting(effect);
        const canChange = field === "requiresApproval" || effect.riskLevel !== "restricted";
        return [effect.key, canChange ? { ...row, [field]: value } : row];
      })),
    }));
  };

  const applyPricePreset = (multiplier: number) => {
    setSaved(false);
    setDraft((current) => ({
      ...current,
      effects: Object.fromEntries(catalog.map((effect) => {
        const row = current.effects[effect.key] ?? defaultEffectSetting(effect);
        return [
          effect.key,
          {
            ...row,
            cost: Math.max(0, Math.round((effect.defaultCreditCost * multiplier) / 10) * 10),
          },
        ];
      })),
    }));
  };

  const updateEventTrigger = (
    key: TwitchEventTriggerKey,
    patch: Partial<TwitchEventTriggerSetting>,
  ) => {
    const definition = twitchEventTriggerDefinitions.find((item) => item.key === key);
    if (!definition) return;
    setSaved(false);
    setDraft((current) => ({
      ...current,
      eventTriggers: {
        ...current.eventTriggers,
        [key]: { ...(current.eventTriggers[key] ?? definition.defaultSetting), ...patch },
      },
    }));
  };

  return (
    <section className="surface config-surface" aria-label="Broadcaster configuration">
      <div className="surface-heading">
        <div>
          <span className="eyebrow">BROADCASTER CONFIGURATION</span>
          <h1>Shape the chaos.</h1>
          <p>Prototype settings are stored only in this browser.</p>
        </div>
        <button className="primary-button" data-testid="save-settings" onClick={() => { onSave(draft); setSaved(true); }}>
          {saved ? "Saved locally ✓" : "Save settings"}
        </button>
      </div>

      <div className="connection-strip">
        <TwitchConnection />
        <div>
          <i className={`status-dot ${adapterHealth === "connected" ? "online" : adapterHealth === "degraded" ? "waiting" : "offline"}`} />
          <span>Game adapter</span>
          <strong>{adapterHealth === "connected" ? "Connected" : adapterHealth === "degraded" ? "Bridge detected" : "Disconnected"}</strong>
        </div>
        <div><i className="status-dot online" /><span>Catalog</span><strong>Server-defined</strong></div>
      </div>
      <div className="warning-callout"><strong>⚠ {dangerousCount} dangerous effects enabled</strong>Enabled effects dispatch automatically by default. Emergency pause remains the streamer safety control.</div>

      <div className="global-controls">
        <label>Global cooldown <span><input type="number" min="0" value={draft.globalCooldownSeconds} onChange={(event) => setDraft({ ...draft, globalCooldownSeconds: Number(event.target.value) })} /> seconds</span></label>
        <label>Per-viewer cooldown floor <span><input type="number" min="0" value={draft.perViewerCooldownSeconds} onChange={(event) => setDraft({ ...draft, perViewerCooldownSeconds: Number(event.target.value) })} /> seconds</span></label>
      </div>

      <div className="pricing-controls">
        <div><strong>Viewer event pricing</strong><span>Costs are working Sparks values per activation.</span></div>
        <button onClick={() => applyPricePreset(0.75)}>Lower cost</button>
        <button onClick={() => applyPricePreset(1)}>Balanced</button>
        <button onClick={() => applyPricePreset(1.5)}>Higher cost</button>
      </div>

      <div className="settings-table-wrap">
        <table className="settings-table">
          <thead><tr>
            <th>Effect</th>
            <th><ColumnToggle label="Enabled" onAll={() => setBooleanColumn("enabled", true)} onNone={() => setBooleanColumn("enabled", false)} /></th>
            <th>Cost / event</th>
            <th><ColumnToggle label="Channel Points" onAll={() => setBooleanColumn("channelPointsEligible", true)} onNone={() => setBooleanColumn("channelPointsEligible", false)} /></th>
            <th>Max / stream</th>
            <th><ColumnToggle label="Approval" onAll={() => setBooleanColumn("requiresApproval", true)} onNone={() => setBooleanColumn("requiresApproval", false)} /></th>
          </tr></thead>
          <tbody>
            {catalog.map((effect) => {
              const row = draft.effects[effect.key] ?? defaultEffectSetting(effect);
              const restricted = effect.riskLevel === "restricted";
              return (
                <tr key={effect.key} className={restricted ? "restricted-row" : ""}>
                  <td>
                    <strong>{effect.displayName}</strong>
                    <span className={`risk-pill risk-${effect.riskLevel}`}>{effect.riskLevel}</span>
                    <span className={`hook-label hook-${effect.hookConfidence}`}>{effect.hookConfidence}</span>
                    <small>{effect.category} · {effect.cooldowns.globalSeconds}s catalog cooldown</small>
                    <small>{effect.hookNote}</small>
                  </td>
                  <td><input aria-label={`Enable ${effect.displayName}`} type="checkbox" disabled={restricted} checked={row.enabled} onChange={(event) => updateEffect(effect.key, { enabled: event.target.checked })} /></td>
                  <td><input aria-label={`${effect.displayName} cost`} className="small-input" type="number" min="0" value={row.cost} onChange={(event) => updateEffect(effect.key, { cost: Number(event.target.value) })} /></td>
                  <td><input aria-label={`${effect.displayName} Channel Points`} type="checkbox" disabled={restricted} checked={row.channelPointsEligible} onChange={(event) => updateEffect(effect.key, { channelPointsEligible: event.target.checked })} /></td>
                  <td><input aria-label={`${effect.displayName} maximum uses`} className="small-input" type="number" min="0" value={row.maxUsesPerStream} onChange={(event) => updateEffect(effect.key, { maxUsesPerStream: Number(event.target.value) })} /></td>
                  <td><input aria-label={`${effect.displayName} approval`} type="checkbox" checked={row.requiresApproval} onChange={(event) => updateEffect(effect.key, { requiresApproval: event.target.checked })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="event-trigger-section" aria-labelledby="event-trigger-heading">
        <div>
          <span className="eyebrow">TWITCH EVENT AUTOMATIONS</span>
          <h2 id="event-trigger-heading">Choose what Twitch milestones trigger.</h2>
          <p>These mappings are saved locally for the prototype. Production EventSub delivery will add durable message deduplication before it creates commands.</p>
        </div>
        <div className="settings-table-wrap">
          <table className="settings-table event-trigger-table">
            <thead><tr><th>Twitch event</th><th>Enabled</th><th>Effect</th><th>Minimum</th><th>Cooldown</th><th>Max / stream</th></tr></thead>
            <tbody>
              {twitchEventTriggerDefinitions.map((definition) => {
                const trigger = draft.eventTriggers[definition.key] ?? definition.defaultSetting;
                return (
                  <tr key={definition.key}>
                    <td>
                      <strong>{definition.label}</strong>
                      <small>{definition.eventSubType} v{definition.eventSubVersion} · {definition.requiredScope}</small>
                      <small>{definition.note}</small>
                    </td>
                    <td><input aria-label={`Enable ${definition.label}`} type="checkbox" checked={trigger.enabled} onChange={(event) => updateEventTrigger(definition.key, { enabled: event.target.checked })} /></td>
                    <td>
                      <select aria-label={`${definition.label} effect`} value={trigger.effectKey} onChange={(event) => updateEventTrigger(definition.key, { effectKey: event.target.value })}>
                        {catalog.filter((effect) => effect.riskLevel !== "restricted").map((effect) => <option key={effect.key} value={effect.key}>{effect.displayName}{effect.enabled ? "" : " — test first"}</option>)}
                      </select>
                    </td>
                    <td><label className="compact-field"><span>{definition.minimumLabel}</span><input type="number" min="1" value={trigger.minimumValue} onChange={(event) => updateEventTrigger(definition.key, { minimumValue: Number(event.target.value) })} /></label></td>
                    <td><label className="compact-field"><span>Seconds</span><input type="number" min="0" value={trigger.cooldownSeconds} onChange={(event) => updateEventTrigger(definition.key, { cooldownSeconds: Number(event.target.value) })} /></label></td>
                    <td><input aria-label={`${definition.label} maximum uses`} className="small-input" type="number" min="0" value={trigger.maxUsesPerStream} onChange={(event) => updateEventTrigger(definition.key, { maxUsesPerStream: Number(event.target.value) })} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function ColumnToggle({
  label,
  onAll,
  onNone,
}: {
  label: string;
  onAll: () => void;
  onNone: () => void;
}) {
  return (
    <span className="column-toggle">
      <span>{label}</span>
      <span><button type="button" onClick={onAll}>All</button><button type="button" onClick={onNone}>None</button></span>
    </span>
  );
}
