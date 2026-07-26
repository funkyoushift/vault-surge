"use client";

import { useMemo, useState } from "react";
import {
  defaultEffectInputs,
  effectCategories,
  validateEffectInputs,
  type EffectCategory,
  type EffectDefinition,
  type EffectViewerParameters,
} from "../lib/contracts/effects";
import type { CommandEnvelope } from "../lib/contracts/commands";

interface Props {
  effects: readonly EffectDefinition[];
  balance: number;
  sessionActive: boolean;
  paused: boolean;
  viewerDisplayName: string;
  viewerIdentityLabel: string;
  recent: readonly CommandEnvelope[];
  onActivate: (effect: EffectDefinition, viewerParameters: EffectViewerParameters) => void;
}

export function ViewerOverlay({
  effects,
  balance,
  sessionActive,
  paused,
  viewerDisplayName,
  viewerIdentityLabel,
  recent,
  onActivate,
}: Props) {
  const [category, setCategory] = useState<EffectCategory>("Helpful");
  const [selected, setSelected] = useState<EffectDefinition | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const visibleEffects = useMemo(() => effects.filter((effect) => effect.category === category), [category, effects]);
  const unavailable = !sessionActive || paused;
  const validation = selected ? validateEffectInputs(selected, inputValues) : null;
  const openConfirmation = (effect: EffectDefinition) => {
    setInputValues({ ...defaultEffectInputs(effect) });
    setSelected(effect);
  };

  return (
    <section className="surface viewer-surface" aria-label="Viewer overlay prototype">
      <div className="viewer-hero">
        <div>
          <span className="eyebrow">VIEWER OVERLAY · LOCAL SIMULATION</span>
          <h1>Make the mayhem yours.</h1>
          <p>Spend simulated Sparks to help, hinder, or completely reroute the run.</p>
        </div>
        <div className="viewer-wallet">
          <span><i className="status-dot online" /> {viewerIdentityLabel}</span>
          <strong>{viewerDisplayName}</strong>
          <div className="balance"><b>{balance.toLocaleString()}</b> SPARKS</div>
        </div>
      </div>

      <div className="simulation-banner">
        <span>SIMULATION</span>
        Bits purchases and Channel Points redemptions are not connected. No real value is spent.
      </div>

      <nav className="category-tabs" aria-label="Effect categories">
        {effectCategories.map((item) => (
          <button className={item === category ? "active" : ""} key={item} onClick={() => setCategory(item)}>
            {item}
          </button>
        ))}
      </nav>

      <div className="effect-grid">
        {visibleEffects.map((effect) => {
          const disabled = unavailable || !effect.enabled || effect.defaultCreditCost > balance;
          return (
            <article className={`effect-card risk-${effect.riskLevel}`} key={effect.key}>
              <div className="effect-card-top">
                <span className="risk-label">{effect.riskLevel}</span>
                <span className={`hook-label hook-${effect.hookConfidence}`}>{effect.hookConfidence}</span>
                {effect.channelPointsEligible && <span className="points-label">CP</span>}
              </div>
              <h2>{effect.displayName}</h2>
              <p>{effect.description}</p>
              <div className="effect-meta">
                <span>↻ {effect.cooldowns.perViewerSeconds}s</span>
                <span>{effect.durationSeconds ? `◷ ${effect.durationSeconds}s` : "⚡ instant"}</span>
              </div>
              <button className="buy-button" disabled={disabled} onClick={() => openConfirmation(effect)} data-testid={`activate-${effect.key}`}>
                {!effect.enabled ? effect.hookConfidence === "candidate" ? "Awaiting BL4 test" : "Restricted" : unavailable ? "Session unavailable" : effect.defaultCreditCost > balance ? "Not enough Sparks" : `${effect.defaultCreditCost} SPARKS`}
              </button>
            </article>
          );
        })}
      </div>

      <div className="viewer-feed">
        <div>
          <span className="eyebrow">LIVE QUEUE</span>
          <strong>{recent.filter((command) => ["queued", "approved", "dispatched", "running"].includes(command.status)).length} pending</strong>
        </div>
        <div className="feed-items">
          {recent.slice(0, 3).map((command) => (
            <span key={command.id}>
              <i className={`mini-status status-${command.status}`} />
              {command.viewerDisplayName} · {effects.find((effect) => effect.key === command.effectKey)?.displayName} · {command.status}
            </span>
          ))}
          {!recent.length && <span className="muted">Your activated effects will appear here.</span>}
        </div>
      </div>

      {selected && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelected(null)}>
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onMouseDown={(event) => event.stopPropagation()}>
            <span className="eyebrow">CONFIRM EFFECT</span>
            <h2 id="confirm-title">{selected.displayName}</h2>
            <p>{selected.description}</p>
            {(selected.inputs ?? []).map((input) => (
              <label className="effect-input" key={input.key}>
                <span>{input.label}</span>
                {input.kind === "select" ? (
                  <select
                    aria-label={input.label}
                    value={inputValues[input.key] ?? input.defaultValue}
                    onChange={(event) => setInputValues((current) => ({ ...current, [input.key]: event.target.value }))}
                  >
                    {input.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                ) : (
                  <textarea
                    aria-label={input.label}
                    placeholder={input.placeholder}
                    maxLength={input.maxLength}
                    rows={input.maxLines}
                    value={inputValues[input.key] ?? ""}
                    onChange={(event) => setInputValues((current) => ({ ...current, [input.key]: event.target.value }))}
                  />
                )}
                {input.helpText && <small>{input.helpText}</small>}
              </label>
            ))}
            {validation && !validation.ok && <p className="input-error" role="alert">{validation.error}</p>}
            <div className="confirm-price"><span>Total</span><strong>{selected.defaultCreditCost} SPARKS</strong></div>
            {selected.requiresApproval && <p className="approval-note">This effect waits for streamer approval before dispatch.</p>}
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setSelected(null)}>Cancel</button>
              <button
                className="primary-button"
                data-testid="confirm-activation"
                disabled={!validation?.ok}
                onClick={() => {
                  if (!validation?.ok) return;
                  onActivate(selected, validation.parameters);
                  setSelected(null);
                }}
              >
                Activate effect
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
