import { useEffect, useMemo, useRef, useState } from "react";
import type {
  PublicEffectDefinition,
} from "../lib/contracts/public-effects";
import type { SparkPackDefinition } from "../lib/contracts/spark-packs";

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

type ViewerWallet = {
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
};

type PendingPurchase = {
  pack: SparkPackDefinition;
};

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
  const [bitsProducts, setBitsProducts] = useState<TwitchBitsProduct[]>([]);
  const [bitsReady, setBitsReady] = useState(false);
  const [sparkPacks, setSparkPacks] = useState<SparkPackDefinition[]>([]);
  const [wallet, setWallet] = useState<ViewerWallet>({
    balance: 0,
    lifetimeEarned: 0,
    lifetimeSpent: 0,
  });
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pendingPurchase = useRef<PendingPurchase | null>(null);

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
        const walletResponse = await parseResponse<{
          wallet: ViewerWallet;
          sparkPacks: SparkPackDefinition[];
        }>(await fetch(`${ebsUrl}/api/twitch/extension/wallet`, {
          headers: { "x-extension-jwt": auth.token },
        }));
        setEffects(catalog.effects);
        setWallet(walletResponse.wallet);
        setSparkPacks(walletResponse.sparkPacks);
        if (window.Twitch?.ext?.features?.isBitsEnabled && window.Twitch.ext.bits) {
          try {
            setBitsProducts(await window.Twitch.ext.bits.getProducts());
            setBitsReady(true);
          } catch {
            setBitsReady(false);
          }
        }
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

  useEffect(() => {
    const bits = window.Twitch?.ext?.bits;
    if (!bits) return;
    bits.onTransactionCancelled(() => {
      pendingPurchase.current = null;
      setSubmitting(false);
      setNotice("Bits purchase was cancelled.");
    });
    bits.onTransactionComplete((transaction) => {
      const pending = pendingPurchase.current;
      const sku = transaction.product?.sku || transaction.productSku || "";
      const transactionId = transaction.transactionId || transaction.transactionID || "";
      const transactionReceipt = transaction.transactionReceipt || "";
      if (!pending || sku !== pending.pack.sku) return;
      if (!transactionId || !transactionReceipt) {
        pendingPurchase.current = null;
        setSubmitting(false);
        setNotice("Twitch did not return a verifiable Bits receipt.");
        return;
      }
      pendingPurchase.current = null;
      void creditSparkPack(sku, transactionId, transactionReceipt);
    });
  }, [authorization, sparkPacks]);

  const categories = useMemo(
    () => ["All", ...new Set(effects.map((effect) => effect.category))],
    [effects],
  );
  const visibleEffects = category === "All"
    ? effects
    : effects.filter((effect) => effect.category === category);
  const selectedCategoryCount = visibleEffects.length;
  const productBySku = useMemo(
    () => new Map(bitsProducts.map((product) => [product.sku, product])),
    [bitsProducts],
  );
  const purchasablePacks = sparkPacks.filter((pack) => productBySku.has(pack.sku));

  const defaultParametersFor = (effect: PublicEffectDefinition) => Object.fromEntries(
    (effect.inputs ?? []).map((input) => [
      input.key,
      input.kind === "select" ? input.defaultValue : "",
    ]),
  );

  const openEffect = (effect: PublicEffectDefinition) => {
    setNotice("");
    const nextParameters = defaultParametersFor(effect);
    if (!effect.inputs?.length) {
      void requestEffect(effect, nextParameters);
      return;
    }
    setSelected(effect);
    setParameters(nextParameters);
  };

  const submitCommand = async (
    effect: PublicEffectDefinition,
    viewerParameters: Record<string, string>,
  ) => {
    if (authorization.status !== "ready") return;
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
          effectKey: effect.key,
          viewerParameters,
        }),
      }));
      setWallet((current) => ({
        ...current,
        balance: Math.max(0, current.balance - effect.creditCost),
        lifetimeSpent: current.lifetimeSpent + effect.creditCost,
      }));
      setNotice(result.command.statusDetail);
      setSelected(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const requestEffect = async (
    effect: PublicEffectDefinition,
    viewerParameters: Record<string, string>,
  ) => {
    if (authorization.status !== "ready") return;
    if (wallet.balance < effect.creditCost) {
      setNotice(`You need ${(effect.creditCost - wallet.balance).toLocaleString()} more Sparks.`);
      return;
    }
    await submitCommand(effect, viewerParameters);
  };

  const buySparkPack = (pack: SparkPackDefinition) => {
    const bits = window.Twitch?.ext?.bits;
    const product = productBySku.get(pack.sku);
    if (!bitsReady || !bits || !product) {
      setNotice("Bits Spark packs are not available yet. Refresh after saving the Twitch products.");
      return;
    }
    pendingPurchase.current = { pack };
    setSubmitting(true);
    setNotice(`Confirm ${product.cost.amount} Bits for ${pack.sparks.toLocaleString()} Sparks.`);
    bits.useBits(product.sku);
  };

  const creditSparkPack = async (sku: string, transactionId: string, transactionReceipt: string) => {
    if (authorization.status !== "ready") return;
    setSubmitting(true);
    try {
      const result = await parseResponse<{ wallet: ViewerWallet }>(
        await fetch(`${ebsUrl}/api/twitch/extension/wallet`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-extension-jwt": authorization.token,
          },
          body: JSON.stringify({ sku, transactionId, transactionReceipt }),
        }),
      );
      setWallet(result.wallet);
      const pack = sparkPacks.find((item) => item.sku === sku);
      setNotice(pack ? `${pack.sparks.toLocaleString()} Sparks added.` : "Sparks added.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Spark purchase failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="viewer component">
      <header>
        <div>
          <span className="eyebrow">VAULT//SURGE</span>
          <h1>Commands</h1>
          <p>{selectedCategoryCount} live effects</p>
        </div>
        <div className="viewer-status">
          <strong>{wallet.balance.toLocaleString()} Sparks</strong>
          <span className={`connection ${authorization.status}`}>
            {authorization.status === "ready"
              ? "Connected"
              : authorization.status === "error"
                ? "Unavailable"
                : "Connecting"}
          </span>
        </div>
      </header>

      {authorization.status === "error" && (
        <div className="notice error">{authorization.message}</div>
      )}
      {notice && <div className="notice">{notice}</div>}

      <section className="spark-shop" aria-label="Buy Sparks">
        {purchasablePacks.length > 0 ? purchasablePacks.map((pack) => {
          const product = productBySku.get(pack.sku);
          return (
            <button
              disabled={authorization.status !== "ready" || submitting}
              key={pack.sku}
              onClick={() => buySparkPack(pack)}
            >
              <span>{pack.sparks.toLocaleString()} Sparks</span>
              <small>{product?.cost.amount ?? pack.bitsCost} Bits</small>
            </button>
          );
        }) : (
          <p>Bits Spark packs loading.</p>
        )}
      </section>

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
            <div className="metadata">
              <span>{effect.creditCost} Sparks</span>
              <span>{effect.cooldowns.perViewerSeconds}s cooldown</span>
            </div>
            <button
              aria-label={`Select ${effect.displayName}`}
              disabled={authorization.status !== "ready" || wallet.balance < effect.creditCost}
              onClick={() => openEffect(effect)}
            >
              <span>{effect.displayName}</span>
              <small>{effect.creditCost} Sparks</small>
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
              <button disabled={submitting} onClick={() => void requestEffect(selected, parameters)}>
                {submitting ? "Sending..." : `Spend ${selected.creditCost} Sparks`}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
