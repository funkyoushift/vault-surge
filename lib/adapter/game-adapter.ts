import type { CommandEnvelope } from "../contracts/commands";

export type AdapterHealth = "connected" | "degraded" | "disconnected";
export type AdapterOutcome = "success" | "failure" | "retryable";
export interface AdapterResult { outcome: AdapterOutcome; detail: string; startedAt: string }

export interface GameAdapter {
  readonly id: string;
  readonly displayName: string;
  getHealth(): AdapterHealth;
  dispatch(command: CommandEnvelope, durationSeconds?: number): Promise<AdapterResult>;
}
