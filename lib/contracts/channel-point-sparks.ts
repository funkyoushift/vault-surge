export interface ChannelPointSparkReward {
  sparks: number;
  title: string;
}

export const channelPointSparkRewards: ChannelPointSparkReward[] = [
  { title: "100 SPARKS", sparks: 100 },
  { title: "500 SPARKS", sparks: 500 },
  { title: "1K SPARKS", sparks: 1_000 },
  { title: "2.5K SPARKS", sparks: 2_500 },
  { title: "5K SPARKS", sparks: 5_000 },
  { title: "10K SPARKS", sparks: 10_000 },
  { title: "20K SPARKS", sparks: 20_000 },
  { title: "50K SPARKS", sparks: 50_000 },
];

export function sparksFromChannelPointRewardTitle(title: string): number | null {
  const normalized = title.trim().toUpperCase().replace(/\s+/g, " ");
  const direct = channelPointSparkRewards.find((reward) => reward.title === normalized);
  if (direct) return direct.sparks;

  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*K?\s+SPARKS?$/);
  if (!match) return null;

  const [, amountText] = match;
  const multiplier = normalized.includes("K ") ? 1_000 : 1;
  const amount = Number(amountText) * multiplier;
  return Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : null;
}
