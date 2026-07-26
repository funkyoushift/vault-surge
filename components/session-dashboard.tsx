"use client";

import type { AdapterHealth } from "../lib/adapter/game-adapter";
import type { CommandEnvelope } from "../lib/contracts/commands";
import type { EffectDefinition, EffectViewerParameters } from "../lib/contracts/effects";

interface Props {
  effects: readonly EffectDefinition[];
  commands: readonly CommandEnvelope[];
  sessionActive: boolean;
  paused: boolean;
  adapterHealth: AdapterHealth;
  actionError: string;
  testEffectKey: string;
  testParameters: EffectViewerParameters;
  onSessionToggle: () => void;
  onPauseToggle: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRetry: (id: string) => void;
  onTestEffectChange: (key: string) => void;
  onTestParameterChange: (key: string, value: string) => void;
  onTest: () => void;
}

const lifecycle = ["received", "validated", "queued", "approved", "dispatched", "running", "completed"];

export function SessionDashboard(props: Props) {
  const testEffect = props.effects.find((effect) => effect.key === props.testEffectKey);
  const pendingApproval = props.commands.filter((command) => command.status === "queued");
  const active = props.commands.filter((command) => !["completed", "rejected", "failed", "cancelled", "refunded", "expired"].includes(command.status));
  return (
    <section className="surface dashboard-surface" aria-label="Session dashboard">
      <div className="surface-heading dashboard-heading">
        <div><span className="eyebrow">SESSION CONTROL</span><h1>Run the room.</h1><p>Monitor signed viewer requests as enabled effects dispatch automatically to Borderlands 4.</p></div>
        <div className="session-actions">
          <button className={props.paused ? "pause-button paused" : "pause-button"} onClick={props.onPauseToggle}>{props.paused ? "Resume effects" : "Emergency pause"}</button>
          <button className={props.sessionActive ? "secondary-button" : "primary-button"} onClick={props.onSessionToggle}>{props.sessionActive ? "Stop session" : "Start session"}</button>
        </div>
      </div>

      <div className="health-grid">
        <Health label="Session" value={props.sessionActive ? props.paused ? "Paused" : "Live" : "Stopped"} state={props.paused ? "waiting" : props.sessionActive ? "online" : "offline"} />
        <Health label="Extension backend" value="Local EBS" state="online" />
        <Health label="Command signer" value="HMAC verified" state="online" />
        <Health label="Game adapter" value={props.adapterHealth} state={props.adapterHealth === "connected" ? "online" : "waiting"} />
      </div>

      <div className="dashboard-grid">
        <aside className="checklist-panel">
          <span className="eyebrow">SETUP CHECKLIST</span>
          <Checklist done label="Effect catalog loaded" detail={`${props.effects.length} allowlisted effects`} />
          <Checklist done={props.adapterHealth === "connected"} label="BL4 SDK adapter paired" detail="Authenticated loopback protocol v1" pending={props.adapterHealth !== "connected"} />
          <Checklist done label="Local settings ready" detail="Browser storage enabled" />
          <Checklist done={props.sessionActive && !props.paused} label="Streamer session live" detail={props.paused ? "Emergency pause active" : props.sessionActive ? "Accepting commands" : "Start when ready"} />
          <Checklist done label="Twitch command boundary" detail="JWT and server catalog enforced" />
        </aside>

        <div className="command-panel">
          <div className="panel-title">
            <div><span className="eyebrow">COMMAND QUEUE</span><h2>{active.length} active · {pendingApproval.length} awaiting approval</h2></div>
          </div>
          <div className="command-list">
            {props.commands.slice(0, 8).map((command) => {
              const effect = props.effects.find((item) => item.key === command.effectKey);
              return (
                <article className="command-row" key={command.id}>
                  <i className={`command-state status-${command.status}`} />
                  <div><strong>{effect?.displayName ?? command.effectKey}</strong><span>{command.viewerDisplayName} · #{command.id.slice(-6)} · attempt {command.attempt}</span>{Object.keys(command.viewerParameters).length > 0 && <span>{Object.values(command.viewerParameters).join(" · ")}</span>}<small>{command.statusDetail}</small></div>
                  <span className={`status-chip status-${command.status}`}>{command.status}</span>
                  <div className="row-actions">
                    {command.status === "queued" && <><button className="accept-button" onClick={() => props.onApprove(command.id)}>Accept</button><button className="reject-button" onClick={() => props.onReject(command.id)}>Reject</button></>}
                    {command.status === "retryable" && <button className="accept-button" onClick={() => props.onRetry(command.id)}>Retry</button>}
                  </div>
                </article>
              );
            })}
            {!props.commands.length && <div className="empty-state">Queue is quiet. Use Test Effect or activate an effect in Viewer mode.</div>}
          </div>
        </div>

        <aside className="test-panel">
          <span className="eyebrow">LIVE TEST EFFECT</span>
          <label>Catalog effect<select value={props.testEffectKey} onChange={(event) => props.onTestEffectChange(event.target.value)}>{props.effects.map((effect) => <option key={effect.key} value={effect.key}>{effect.displayName}{effect.enabled ? "" : " — viewer inactive"}</option>)}</select></label>
          {(testEffect?.inputs ?? []).map((input) => (
            <label key={input.key}>
              {input.label}
              {input.kind === "select" ? (
                <select
                  value={props.testParameters[input.key] ?? input.defaultValue}
                  onChange={(event) => props.onTestParameterChange(input.key, event.target.value)}
                >
                  {input.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              ) : (
                <textarea
                  rows={input.maxLines}
                  maxLength={input.maxLength}
                  placeholder={input.placeholder}
                  value={props.testParameters[input.key] ?? ""}
                  onChange={(event) => props.onTestParameterChange(input.key, event.target.value)}
                />
              )}
              {input.helpText && <small>{input.helpText}</small>}
            </label>
          ))}
          <button className="primary-button full-button" disabled={!props.sessionActive || props.paused || props.adapterHealth !== "connected"} onClick={props.onTest}>Send live test command</button>
          {props.actionError && <p className="test-note command-error" role="alert">{props.actionError}</p>}
          <p className="test-note">Live tests expose the complete catalog and bypass viewer credits, viewer availability, and approval while still using input validation, HMAC signing, the companion worker, and the BL4 SDK adapter.</p>
          <div className="lifecycle">{lifecycle.map((item, index) => <span key={item}>{index + 1}<b>{item}</b></span>)}</div>
        </aside>
      </div>
    </section>
  );
}

function Health({ label, value, state }: { label: string; value: string; state: "online" | "waiting" | "offline" }) {
  return <div className="health-card"><i className={`status-dot ${state}`} /><div><small>{label}</small><strong>{value}</strong></div></div>;
}

function Checklist({ done, label, detail, pending = false }: { done: boolean; label: string; detail: string; pending?: boolean }) {
  return <div className={`checklist-item ${pending ? "pending" : ""}`}><i>{done ? "✓" : pending ? "○" : "!"}</i><div><strong>{label}</strong><span>{detail}</span></div></div>;
}
