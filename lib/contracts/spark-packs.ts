export interface SparkPackDefinition {
  sku: string;
  displayName: string;
  bitsCost: number;
  sparks: number;
}

export const sparkPacks: readonly SparkPackDefinition[] = [
  { sku: "vaultsurge.sparks_500", displayName: "Small Spark Pack", bitsCost: 100, sparks: 500 },
  { sku: "vaultsurge.sparks_1500", displayName: "Medium Spark Pack", bitsCost: 250, sparks: 1500 },
  { sku: "vaultsurge.sparks_3500", displayName: "Large Spark Pack", bitsCost: 500, sparks: 3500 },
  { sku: "vaultsurge.sparks_8000", displayName: "Mega Spark Pack", bitsCost: 1000, sparks: 8000 },
] as const;

export const sparkPackBySku = new Map(sparkPacks.map((pack) => [pack.sku, pack]));
