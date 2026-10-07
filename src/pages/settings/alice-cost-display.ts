/**
 * A1-012 display helpers. Mirrors the dashboard payload; no provider call.
 */
export type AliceCostDashboardView = {
  days: number;
  today: string;
  instanceTodayUSD: string;
  daily: { date: string; costUSD: string }[];
  conversations: { conversationId: number; name: string; costUSD: string }[];
  models: { modelVersion: string; costUSD: string; invokes: number }[];
};

export function aliceCostPeak(daily: AliceCostDashboardView["daily"]): string {
  return daily.reduce((peak, day) => (Number(day.costUSD) > Number(peak) ? day.costUSD : peak), "0.000000");
}

export function aliceCostBarPercent(costUSD: string, peakUSD: string): number {
  const peak = Number(peakUSD);
  const cost = Number(costUSD);
  if (!Number.isFinite(peak) || peak <= 0 || !Number.isFinite(cost) || cost <= 0) return 0;
  return Math.min(100, Math.round((cost / peak) * 100));
}

export function aliceCostBarStyle(costUSD: string, peakUSD: string): { height: string } {
  return { height: `${aliceCostBarPercent(costUSD, peakUSD)}%` };
}

export function formatAliceCost(costUSD: string): string {
  const value = Number(costUSD);
  if (!Number.isFinite(value)) return "$0.000000";
  return `$${value.toFixed(6)}`;
}
