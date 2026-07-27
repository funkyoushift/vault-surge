export type EffectLifecycleStatus =
  | "received" | "validated" | "queued" | "approved" | "dispatched" | "running" | "completed"
  | "rejected" | "unavailable" | "retryable" | "failed" | "cancelled" | "refunded" | "expired";

export interface CommandEnvelope {
  id: string;
  effectKey: string;
  viewerId: string;
  viewerDisplayName: string;
  quantity: number;
  unitCreditCost: number;
  monetization: {
    source: "development" | "bits" | "channel_points" | "eventsub";
    sku?: string;
    transactionId?: string;
    amount?: number;
  };
  createdAt: string;
  expiresAt: string;
  nonce: string;
  signature: string;
  status: EffectLifecycleStatus;
  statusDetail: string;
  attempt: number;
  adapterParameters: Readonly<Record<string, string | number | boolean>>;
  viewerParameters: Readonly<Record<string, string>>;
}

export const terminalStatuses: readonly EffectLifecycleStatus[] = [
  "completed", "rejected", "unavailable", "failed", "cancelled", "refunded", "expired",
];
