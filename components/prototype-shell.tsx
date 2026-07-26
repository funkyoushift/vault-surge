"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BroadcasterConfig, type PrototypeSettings } from "./broadcaster-config";
import { SessionDashboard } from "./session-dashboard";
import type { AdapterHealth } from "../lib/adapter/game-adapter";
import type { CommandEnvelope } from "../lib/contracts/commands";
import {
  defaultEffectInputs,
  effectCatalog,
  validateEffectInputs,
  type EffectDefinition,
  type EffectViewerParameters,
} from "../lib/contracts/effects";
import {
  defaultTwitchEventTriggers,
  twitchEventTriggerDefinitions,
} from "../lib/contracts/twitch-event-triggers";

type Surface = "config" | "session";
type PrototypeShellProps = {
  initialSurface?: Surface;
  lockSurface?: boolean;
};

const defaultSettings: PrototypeSettings = {
  globalCooldownSeconds: 5,
  perViewerCooldownSeconds: 20,
  effects: Object.fromEntries(effectCatalog.map((effect) => [effect.key, {
    enabled: effect.enabled,
    cost: effect.defaultCreditCost,
    channelPointsEligible: effect.channelPointsEligible,
    requiresApproval: false,
    maxUsesPerStream: effect.quantityLimits.maxUsesPerStream,
  }])),
  eventTriggers: defaultTwitchEventTriggers,
};

export function PrototypeShell({
  initialSurface = "config",
  lockSurface = false,
}: PrototypeShellProps) {
  const [surface, setSurface] = useState<Surface>(initialSurface);
  const [settings, setSettings] = useState(defaultSettings);
  const [commands, setCommands] = useState<CommandEnvelope[]>([]);
  const [sessionActive, setSessionActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [testEffectKey, setTestEffectKey] = useState("heal_player");
  const [testParameters, setTestParameters] = useState<EffectViewerParameters>(
    defaultEffectInputs(effectCatalog[0]),
  );
  const [adapterHealth, setAdapterHealth] = useState<AdapterHealth>("disconnected");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem("vault-surge-settings-v3");
      if (!stored) return;
      try {
        const parsed = JSON.parse(stored) as Partial<PrototypeSettings>;
        setSettings({
          globalCooldownSeconds: parsed.globalCooldownSeconds ?? defaultSettings.globalCooldownSeconds,
          perViewerCooldownSeconds: parsed.perViewerCooldownSeconds ?? defaultSettings.perViewerCooldownSeconds,
          effects: { ...defaultSettings.effects, ...(parsed.effects ?? {}) },
          eventTriggers: Object.fromEntries(twitchEventTriggerDefinitions.map((definition) => [
            definition.key,
            {
              ...definition.defaultSetting,
              ...(parsed.eventTriggers?.[definition.key] ?? {}),
            },
          ])) as PrototypeSettings["eventTriggers"],
        });
      } catch {
        window.localStorage.removeItem("vault-surge-settings-v3");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const refreshCompanion = useCallback(async () => {
    try {
      const response = await fetch("/api/local/commands", { cache: "no-store" });
      if (!response.ok) throw new Error("Local companion status failed.");
      const data = await response.json() as {
        commands?: CommandEnvelope[];
        sdk?: { started?: boolean; paired?: boolean };
        state?: { sessionActive?: boolean; paused?: boolean };
      };
      setCommands(data.commands ?? []);
      setSessionActive(Boolean(data.state?.sessionActive));
      setPaused(Boolean(data.state?.paused));
      setAdapterHealth(data.sdk?.started && data.sdk?.paired
        ? "connected"
        : data.sdk?.started ? "degraded" : "disconnected");
    } catch {
      setAdapterHealth("disconnected");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      await refreshCompanion();
      if (!cancelled) {
        timer = window.setTimeout(() => void poll(), 3000);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [refreshCompanion]);

  const configuredEffects = useMemo(() => effectCatalog.map((effect) => ({
    ...effect,
    enabled: settings.effects[effect.key]?.enabled ?? effect.enabled,
    defaultCreditCost: settings.effects[effect.key]?.cost ?? effect.defaultCreditCost,
    channelPointsEligible: settings.effects[effect.key]?.channelPointsEligible ?? effect.channelPointsEligible,
    requiresApproval: settings.effects[effect.key]?.requiresApproval ?? effect.requiresApproval,
    quantityLimits: {
      ...effect.quantityLimits,
      maxUsesPerStream: settings.effects[effect.key]?.maxUsesPerStream ?? effect.quantityLimits.maxUsesPerStream,
    },
  })), [settings]);

  const localAction = async (action: string, id: string) => {
    try {
      setActionError("");
      const response = await fetch("/api/local/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Companion action failed.");
      await refreshCompanion();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Companion action failed.");
    }
  };

  const createCommand = async (
    effect: EffectDefinition,
    rawViewerParameters: EffectViewerParameters = defaultEffectInputs(effect),
  ) => {
    if (!sessionActive || paused) return;
    const validation = validateEffectInputs(effect, rawViewerParameters);
    if (!validation.ok) return;
    try {
      setActionError("");
      const response = await fetch("/api/local/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          effectKey: effect.key,
          // The broadcaster is explicitly firing this from the local live-test
          // panel, so it must dispatch immediately even if viewer approval is on.
          requiresApproval: false,
          viewerParameters: validation.parameters,
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Live test command failed.");
      await refreshCompanion();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Live test command failed.");
    }
  };

  const saveSettings = (value: PrototypeSettings) => {
    setSettings(value);
    window.localStorage.setItem("vault-surge-settings-v3", JSON.stringify(value));
  };
  const testEffect = configuredEffects.find((effect) => effect.key === testEffectKey) ?? configuredEffects[0];
  const headerStatus = paused
    ? { dot: "danger", text: "Effects paused" }
    : adapterHealth === "connected"
      ? { dot: "online", text: sessionActive ? "Game connected · Session live" : "Game connected · Session stopped" }
      : adapterHealth === "degraded"
        ? { dot: "waiting", text: "Game bridge detected" }
        : { dot: "offline", text: "Game disconnected" };

  return (
    <main className="app-shell">
      <header className="app-header">
        <button className="brand" onClick={() => { if (!lockSurface) setSurface("config") }} aria-label="Vault Surge home"><span className="brand-mark">V</span><span><b>VAULT//SURGE</b><small>STREAMER COMPANION</small></span></button>
        {!lockSurface && (
          <nav className="surface-nav" aria-label="Streamer companion sections">
            <button className={surface === "config" ? "active" : ""} onClick={() => setSurface("config")}>Configure</button>
            <button className={surface === "session" ? "active" : ""} onClick={() => setSurface("session")}>Session</button>
          </nav>
        )}
        <div className="header-status"><i className={`status-dot ${headerStatus.dot}`} /><span>{headerStatus.text}</span></div>
      </header>
      <div className="workspace">
        {surface === "config" && <BroadcasterConfig key={JSON.stringify(settings)} catalog={effectCatalog} settings={settings} adapterHealth={adapterHealth} onSave={saveSettings} />}
        {surface === "session" && (
          <SessionDashboard
            effects={configuredEffects}
            commands={commands}
            sessionActive={sessionActive}
            paused={paused}
            adapterHealth={adapterHealth}
            actionError={actionError}
            testEffectKey={testEffectKey}
            testParameters={testParameters}
            onSessionToggle={() => { void localAction("set-session", String(!sessionActive)) }}
            onPauseToggle={() => { void localAction("set-pause", String(!paused)) }}
            onApprove={(id) => { void localAction("approve", id) }}
            onReject={(id) => { void localAction("reject", id) }}
            onRetry={(id) => { void localAction("retry", id) }}
            onTestEffectChange={(key) => {
              setTestEffectKey(key);
              const effect = configuredEffects.find((item) => item.key === key);
              setTestParameters(effect ? defaultEffectInputs(effect) : {});
            }}
            onTestParameterChange={(key, value) => {
              setTestParameters((current) => ({ ...current, [key]: value }));
            }}
            onTest={() => { void createCommand(testEffect, testParameters) }}
          />
        )}
      </div>
      <footer><span>LOCAL STREAMER COMPANION</span><span>Catalog authoritative · Signed commands · BL4 SDK adapter v1</span></footer>
    </main>
  );
}
