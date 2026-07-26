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

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/twitch/status", { cache: "no-store" });
      if (response.ok) setStatus(await response.json() as TwitchStatus);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh() }, [refresh]);

  const disconnect = async () => {
    setLoading(true);
    await fetch("/api/twitch/oauth/logout", { method: "POST" });
    await refresh();
  };

  return (
    <div className="twitch-connection">
      <i className={`status-dot ${status.connected ? "online" : status.configured ? "waiting" : "offline"}`} />
      <span>Twitch broadcaster</span>
      <strong>{loading ? "Checking…" : status.connected ? status.broadcaster?.login : status.configured ? "Ready to connect" : "Needs credentials"}</strong>
      {status.connected ? (
        <button className="connection-action" type="button" onClick={() => void disconnect()}>Disconnect</button>
      ) : (
        <a className={`connection-action ${!status.configured ? "disabled" : ""}`} href={status.configured ? "/api/twitch/oauth/start" : undefined} aria-disabled={!status.configured}>
          Connect
        </a>
      )}
    </div>
  );
}
