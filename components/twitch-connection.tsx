"use client";

import { useCallback, useEffect, useState } from "react";

interface TwitchStatus {
  configured: boolean;
  connected: boolean;
  broadcaster: { id: string; login: string; scopes: string[] } | null;
  requiredScopes: string[];
  extensionVerificationConfigured: boolean;
  eventSubVerificationConfigured: boolean;
}

interface EventSubSubscriptionStatus {
  id: string;
  status: string;
  type: string;
  transport?: { method?: string; callback?: string };
}

interface EventSubSetupStatus {
  callback?: string;
  subscriptions?: EventSubSubscriptionStatus[];
  error?: string;
}

const initialStatus: TwitchStatus = {
  configured: false,
  connected: false,
  broadcaster: null,
  requiredScopes: [],
  extensionVerificationConfigured: false,
  eventSubVerificationConfigured: false,
};

export function TwitchConnection() {
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(true);
  const [eventSubState, setEventSubState] = useState("");
  const [eventSubStatus, setEventSubStatus] = useState<EventSubSetupStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/twitch/status", { cache: "no-store" });
      if (response.ok) setStatus(await response.json() as TwitchStatus);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh() }, [refresh]);

  const refreshChannelPointStatus = useCallback(async () => {
    if (!status.connected) return;
    try {
      const response = await fetch("/api/twitch/eventsub/setup", { cache: "no-store" });
      const payload = await response.json() as EventSubSetupStatus;
      setEventSubStatus(payload);
      if (!response.ok) throw new Error(payload.error || "Could not read Channel Points setup.");
      const active = payload.subscriptions?.some((subscription) => subscription.status === "enabled");
      const statusText = payload.subscriptions?.map((subscription) => subscription.status).join(", ") || "none";
      setEventSubState(active ? "Channel Points linked" : `Channel Points subscription: ${statusText}`);
    } catch (error) {
      setEventSubState(error instanceof Error ? error.message : "Could not read Channel Points setup.");
    }
  }, [status.connected]);

  const disconnect = async () => {
    setLoading(true);
    await fetch("/api/twitch/oauth/logout", { method: "POST" });
    await refresh();
  };

  const setupChannelPoints = async () => {
    setEventSubState("Setting up...");
    try {
      const response = await fetch("/api/twitch/eventsub/setup", { method: "POST" });
      const payload = await response.json() as { created?: unknown[]; alreadyExists?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error || "Setup failed.");
      setEventSubState(payload.alreadyExists ? "Channel Points already linked" : "Channel Points linked");
      await refreshChannelPointStatus();
    } catch (error) {
      setEventSubState(error instanceof Error ? error.message : "Setup failed.");
    }
  };

  return (
    <div className="twitch-connection">
      <i className={`status-dot ${status.connected ? "online" : status.configured ? "waiting" : "offline"}`} />
      <span>Twitch broadcaster</span>
      <strong>{loading ? "Checking…" : status.connected ? status.broadcaster?.login : status.configured ? "Ready to connect" : "Needs credentials"}</strong>
      {status.connected ? (
        <>
          <button className="connection-action" type="button" onClick={() => void setupChannelPoints()}>
            Setup Channel Points
          </button>
          <button className="connection-action" type="button" onClick={() => void refreshChannelPointStatus()}>
            Check Channel Points
          </button>
          <button className="connection-action" type="button" onClick={() => void disconnect()}>Disconnect</button>
        </>
      ) : (
        <a className={`connection-action ${!status.configured ? "disabled" : ""}`} href={status.configured ? "/api/twitch/oauth/start" : undefined} aria-disabled={!status.configured}>
          Connect
        </a>
      )}
      {eventSubState && <small className="connection-note">{eventSubState}</small>}
      {eventSubStatus?.subscriptions && (
        <small className="connection-note">
          EventSub: {eventSubStatus.subscriptions.length
            ? eventSubStatus.subscriptions.map((subscription) => subscription.status).join(", ")
            : "no matching subscription"}
        </small>
      )}
    </div>
  );
}
