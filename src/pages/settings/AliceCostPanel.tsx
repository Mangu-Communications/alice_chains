/**
 * A1-012. Admin-only view of alice_cost_daily (MASTER §7.7 / US-179).
 */
import { aliceCostBarStyle, aliceCostPeak, formatAliceCost, type AliceCostDashboardView } from "./alice-cost-display";

export default function AliceCostPanel({
  dashboard,
  instanceCapUSD,
  convCapUSD,
}: {
  dashboard: AliceCostDashboardView;
  instanceCapUSD: number;
  convCapUSD: number;
}) {
  const peak = aliceCostPeak(dashboard.daily);
  return (
    <section className="space-y-3 pt-4 border-t border-border" aria-labelledby="alice-cost-heading">
      <h2 id="alice-cost-heading" className="text-sm font-semibold">
        Alice spend
      </h2>
      <p className="text-xs text-muted-foreground">
        UTC daily totals from alice_cost_daily. Today {formatAliceCost(dashboard.instanceTodayUSD)} of $
        {instanceCapUSD.toFixed(2)} instance cap. Per conversation cap ${convCapUSD.toFixed(2)}.
      </p>
      <div className="flex h-24 items-end gap-0.5" aria-hidden="true">
        {dashboard.daily.map((day) => (
          <div
            key={day.date}
            className="min-w-0 flex-1 rounded-sm bg-primary/80"
            style={aliceCostBarStyle(day.costUSD, peak)}
            title={`${day.date} ${formatAliceCost(day.costUSD)}`}
          />
        ))}
      </div>
      <table className="w-full text-xs">
        <caption className="sr-only">Instance Alice spend for the last {dashboard.days} UTC days</caption>
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="font-medium">Date</th>
            <th className="font-medium">Cost</th>
          </tr>
        </thead>
        <tbody>
          {dashboard.daily
            .filter((day) => Number(day.costUSD) > 0)
            .map((day) => (
              <tr key={day.date}>
                <td>{day.date}</td>
                <td className="tabular-nums">{formatAliceCost(day.costUSD)}</td>
              </tr>
            ))}
          {dashboard.daily.every((day) => Number(day.costUSD) === 0) && (
            <tr>
              <td colSpan={2}>No instance spend in this window.</td>
            </tr>
          )}
        </tbody>
      </table>
      <h3 className="text-xs font-semibold">Per conversation</h3>
      <table className="w-full text-xs">
        <caption className="sr-only">Alice spend by conversation</caption>
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="font-medium">Conversation</th>
            <th className="font-medium">Cost</th>
          </tr>
        </thead>
        <tbody>
          {dashboard.conversations.length === 0 ? (
            <tr>
              <td colSpan={2}>No conversation spend in this window.</td>
            </tr>
          ) : (
            dashboard.conversations.map((row) => (
              <tr key={row.conversationId}>
                <td>{row.name}</td>
                <td className="tabular-nums">{formatAliceCost(row.costUSD)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <h3 className="text-xs font-semibold">Model</h3>
      <ul className="text-xs text-muted-foreground">
        {dashboard.models.length === 0 ? (
          <li>No recorded model versions in this window.</li>
        ) : (
          dashboard.models.map((row) => (
            <li key={row.modelVersion}>
              {row.modelVersion}: {formatAliceCost(row.costUSD)} ({row.invokes})
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
