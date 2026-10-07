/**
 * A1-012. Shape alice_cost_daily rows into the admin dashboard (MASTER §7.7).
 * Does not read secrets or call the provider.
 */
export const ALICE_COST_DASHBOARD_DAYS = 30;

export type AliceCostDashboardRow = {
  date: string | Date;
  scope: "instance" | "conversation";
  scopeId: number | null;
  costUSD: string;
  inputTokens: number;
  outputTokens: number;
};

export type AliceInvokeCostFact = {
  detail: string | null;
};

export type AliceCostDashboard = {
  days: number;
  today: string;
  instanceTodayUSD: string;
  daily: { date: string; costUSD: string }[];
  conversations: {
    conversationId: number;
    name: string;
    costUSD: string;
    inputTokens: number;
    outputTokens: number;
  }[];
  models: { modelVersion: string; costUSD: string; invokes: number }[];
};

export function aliceCostWindow(today: string, days = ALICE_COST_DASHBOARD_DAYS): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error("today must be YYYY-MM-DD");
  const start = new Date(`${today}T00:00:00.000Z`);
  const dates: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() - offset);
    dates.push(day.toISOString().slice(0, 10));
  }
  return dates;
}

function money(value: number): string {
  return value.toFixed(6);
}

function asDate(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/** Rolling instance series, conversation totals, and model totals from invoke detail. */
export function buildAliceCostDashboard(input: {
  today: string;
  rows: AliceCostDashboardRow[];
  names?: Record<number, string | null>;
  invokes?: AliceInvokeCostFact[];
  days?: number;
}): AliceCostDashboard {
  const days = input.days ?? ALICE_COST_DASHBOARD_DAYS;
  const window = aliceCostWindow(input.today, days);
  const allowed = new Set(window);
  const instanceByDay = new Map(window.map((date) => [date, 0]));
  const conversations = new Map<
    number,
    { costUSD: number; inputTokens: number; outputTokens: number }
  >();

  for (const row of input.rows) {
    const date = asDate(row.date);
    if (!allowed.has(date)) continue;
    const cost = Number(row.costUSD);
    if (!Number.isFinite(cost) || cost < 0) continue;
    if (row.scope === "instance") {
      instanceByDay.set(date, (instanceByDay.get(date) ?? 0) + cost);
      continue;
    }
    if (row.scopeId == null || !Number.isInteger(row.scopeId)) continue;
    const current = conversations.get(row.scopeId) ?? {
      costUSD: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    current.costUSD += cost;
    current.inputTokens += row.inputTokens;
    current.outputTokens += row.outputTokens;
    conversations.set(row.scopeId, current);
  }

  const models = new Map<string, { costUSD: number; invokes: number }>();
  for (const invoke of input.invokes ?? []) {
    if (!invoke.detail) continue;
    let parsed: { modelVersion?: unknown; costUSD?: unknown };
    try {
      parsed = JSON.parse(invoke.detail) as { modelVersion?: unknown; costUSD?: unknown };
    } catch {
      continue;
    }
    if (typeof parsed.modelVersion !== "string" || parsed.modelVersion.trim() === "") continue;
    const cost = Number(parsed.costUSD);
    const current = models.get(parsed.modelVersion) ?? { costUSD: 0, invokes: 0 };
    current.invokes += 1;
    if (Number.isFinite(cost) && cost >= 0) current.costUSD += cost;
    models.set(parsed.modelVersion, current);
  }

  return {
    days,
    today: input.today,
    instanceTodayUSD: money(instanceByDay.get(input.today) ?? 0),
    daily: window.map((date) => ({ date, costUSD: money(instanceByDay.get(date) ?? 0) })),
    conversations: [...conversations.entries()]
      .map(([conversationId, totals]) => ({
        conversationId,
        name: input.names?.[conversationId]?.trim() || `Conversation ${conversationId}`,
        costUSD: money(totals.costUSD),
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
      }))
      .sort((a, b) => Number(b.costUSD) - Number(a.costUSD) || a.conversationId - b.conversationId),
    models: [...models.entries()]
      .map(([modelVersion, totals]) => ({
        modelVersion,
        costUSD: money(totals.costUSD),
        invokes: totals.invokes,
      }))
      .sort((a, b) => Number(b.costUSD) - Number(a.costUSD) || a.modelVersion.localeCompare(b.modelVersion)),
  };
}

/** Bar height as a percent of the busiest day. Empty spend stays at zero. */
export function aliceCostBarPercent(costUSD: string, peakUSD: string): number {
  const peak = Number(peakUSD);
  const cost = Number(costUSD);
  if (!Number.isFinite(peak) || peak <= 0 || !Number.isFinite(cost) || cost <= 0) return 0;
  return Math.min(100, Math.round((cost / peak) * 100));
}
