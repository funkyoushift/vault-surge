import { useEffect, useMemo, useState } from "react";
import type {
  PublicEffectDefinition,
} from "../lib/contracts/public-effects";

const ebsUrl = (
  import.meta.env.VITE_EXTENSION_EBS_URL || "https://localhost:3000"
).replace(/\/+$/, "");

type ExtensionIdentity = {
  opaqueUserId: string;
  linked: boolean;
};

type AuthorizationState =
  | { status: "waiting" }
  | { status: "ready"; token: string; identity: ExtensionIdentity }
  | { status: "error"; message: string };

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status}).`);
  }
  return payload;
}

export function ViewerApp() {
  const [authorization, setAuthorization] = useState<AuthorizationState>({
    status: "waiting",
  });
  const [effects, setEffects] = useState<PublicEffectDefinition[]>([]);
  const [category, setCategory] = useState("All");
  const [selected, setSelected] = useState<PublicEffectDefinition | null>(null);
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const connect = async (auth: VaultSurgeAuthorization) => {
      try {
        const session = await parseResponse<{
          identity: ExtensionIdentity;
        }>(await fetch(`${ebsUrl}/api/twitch/extension/session`, {
          method: "POST",
          headers: { "x-extension-jwt": auth.token },
        }));
        const catalog = await parseResponse<{
          effects: PublicEffectDefinition[];
        }>(await fetch(`${ebsUrl}/api/twitch/extension/catalog`, {
          headers: { "x-extension-jwt": auth.token },
        }));
        setEffects(catalog.effects);
        setAuthorization({
          status: "ready",
          token: auth.token,
          identity: session.identity,
        });
      } catch (error) {
        setAuthorization({
          status: "error",
          message: error instanceof Error ? error.message : "Unable to connect.",
        });
      }
    };

    if (window.__VAULT_SURGE_AUTHORIZATION__) {
      void connect(window.__VAULT_SURGE_AUTHORIZATION__);
      return;
    }
    const listeners = window.__VAULT_SURGE_AUTH_LISTENERS__;
    if (!listeners) {
      const timer = window.setTimeout(() => setAuthorization({
        status: "error",
        message: "Twitch authorization helper did not initialize.",
      }), 0);
      return () => window.clearTimeout(timer);
    }
    listeners.push((auth) => void connect(auth));
  }, []);

  const categories = useMemo(
    () => ["All", ...new Set(effects.map((effect) => effect.category))],
    [effects],
  );
  const visibleEffects = category === "All"
    ? effects
    : effects.filter((effect) => effect.category === category);

  const openEffect = (effect: PublicEffectDefinition) => {
    setSelected(effect);
    setNotice("");
    setParameters(Object.fromEntries((effect.inputs ?? []).map((input) => [
      input.key,
      input.kind === "select" ? input.defaultValue : "",
    ])));
  };

  const submitEffect = async () => {
    if (!selected || authorization.status !== "ready") return;
    setSubmitting(true);
    setNotice("");
    try {
      const result = await parseResponse<{
        command: { id: string; status: string; statusDetail: string };
      }>(await fetch(`${ebsUrl}/api/twitch/extension/commands`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-extension-jwt": authorization.token,
        },
        body: JSON.stringify({
          effectKey: selected.key,
          viewerParameters: parameters,
        }),
      }));
      setNotice(result.command.statusDetail);
      setSelected(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="viewer component">
      <header>
        <div>
          <span className="eyebrow">VAULT//SURGE</span>
          <h1>Choose the chaos.</h1>
        </div>
        <span className={`connection ${authorization.status}`}>
          {authorization.status === "ready"
            ? "Connected"
            : authorization.status === "error"
              ? "Unavailable"
              : "Connecting"}
        </span>
      </header>

      {authorization.status === "error" && (
        <div className="notice error">{authorization.message}</div>
      )}
      {notice && <div className="notice">{notice}</div>}

      <nav aria-label="Effect categories">
        {categories.map((item) => (
          <button
            className={item === category ? "active" : ""}
            key={item}
            onClick={() => setCategory(item)}
          >
            {item}
          </button>
        ))}
      </nav>

      <section className="effect-grid" aria-live="polite">
        {visibleEffects.map((effect) => (
          <article key={effect.key} className={`effect ${effect.riskLevel}`}>
            <div className="effect-top">
              <span>{effect.category}</span>
              {effect.requiresApproval && <span>Approval</span>}
            </div>
            <h2>{effect.displayName}</h2>
            <p>{effect.description}</p>
            <div className="metadata">
              <span>{effect.creditCost} Sparks</span>
              <span>{effect.cooldowns.perViewerSeconds}s cooldown</span>
            </div>
            <button
              disabled={authorization.status !== "ready"}
              onClick={() => openEffect(effect)}
            >
              Select
            </button>
          </article>
        ))}
      </section>

      {selected && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="effect-title">
            <span className="eyebrow">{selected.category}</span>
            <h2 id="effect-title">{selected.displayName}</h2>
            <p>{selected.description}</p>
            {(selected.inputs ?? []).map((input) => (
              <label key={input.key}>
                <span>{input.label}</span>
                {input.kind === "select" ? (
                  <select
                    value={parameters[input.key] ?? input.defaultValue}
                    onChange={(event) => setParameters({
                      ...parameters,
                      [input.key]: event.target.value,
                    })}
                  >
                    {input.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <textarea
                    maxLength={input.maxLength}
                    placeholder={input.placeholder}
                    value={parameters[input.key] ?? ""}
                    onChange={(event) => setParameters({
                      ...parameters,
                      [input.key]: event.target.value,
                    })}
                  />
                )}
              </label>
            ))}
            <div className="modal-actions">
              <button className="secondary" onClick={() => setSelected(null)}>
                Cancel
              </button>
              <button disabled={submitting} onClick={() => void submitEffect()}>
                {submitting ? "Sending…" : `Confirm ${selected.creditCost} Sparks`}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
