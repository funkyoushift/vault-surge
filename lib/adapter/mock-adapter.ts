import type { CommandEnvelope } from "../contracts/commands";
import type { AdapterHealth, AdapterOutcome, AdapterResult, GameAdapter } from "./game-adapter";

export class MockGameAdapter implements GameAdapter {
  readonly id = "mock-adapter-v1";
  readonly displayName = "Local Mock Adapter";
  private health: AdapterHealth = "connected";
  private nextOutcome: AdapterOutcome = "success";

  getHealth() { return this.health }
  setHealth(health: AdapterHealth) { this.health = health }
  setNextOutcome(outcome: AdapterOutcome) { this.nextOutcome = outcome }

  async dispatch(command: CommandEnvelope, durationSeconds?: number): Promise<AdapterResult> {
    await new Promise((resolve) => setTimeout(resolve, 450));
    const outcome = this.nextOutcome;
    this.nextOutcome = "success";
    if (this.health === "disconnected") {
      return { outcome: "retryable", detail: "Mock adapter is disconnected; command can be retried.", startedAt: new Date().toISOString() };
    }
    if (outcome === "failure") {
      return { outcome, detail: "Mock adapter simulated a non-retryable game error.", startedAt: new Date().toISOString() };
    }
    if (outcome === "retryable") {
      return { outcome, detail: "Game state is temporarily unsafe. Retry when the player is loaded.", startedAt: new Date().toISOString() };
    }
    const selection = Object.values(command.viewerParameters).filter(Boolean).join(" · ");
    return {
      outcome,
      detail: durationSeconds
        ? `Timed effect started for ${durationSeconds} seconds${selection ? ` with ${selection}` : ""}.`
        : `Command ${command.id.slice(-6)}${selection ? ` with ${selection}` : ""} completed in the mock game.`,
      startedAt: new Date().toISOString(),
    };
  }
}
