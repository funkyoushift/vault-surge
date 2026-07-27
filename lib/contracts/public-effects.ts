import type {
  EffectCategory,
  EffectDefinition,
  EffectInputDefinition,
  RiskLevel,
} from "./effects";

export interface PublicEffectDefinition {
  key: string;
  displayName: string;
  description: string;
  category: EffectCategory;
  riskLevel: Exclude<RiskLevel, "restricted">;
  creditCost: number;
  bitsSku: string;
  bitsCost: number;
  durationSeconds?: number;
  cooldowns: { globalSeconds: number; perViewerSeconds: number };
  requiresApproval: boolean;
  inputs?: readonly EffectInputDefinition[];
}

export function toPublicEffectDefinition(
  effect: EffectDefinition,
): PublicEffectDefinition | null {
  if (!effect.enabled || effect.riskLevel === "restricted") return null;
  return {
    key: effect.key,
    displayName: effect.displayName,
    description: effect.description,
    category: effect.category,
    riskLevel: effect.riskLevel,
    creditCost: effect.defaultCreditCost,
    bitsSku: `vaultsurge.${effect.key}`,
    bitsCost: effect.defaultCreditCost,
    durationSeconds: effect.durationSeconds,
    cooldowns: effect.cooldowns,
    requiresApproval: effect.requiresApproval,
    inputs: effect.inputs,
  };
}
