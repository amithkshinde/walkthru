import { timeAgo, formatTime } from "@/lib/format";

export interface ViewRow {
  id: string;
  viewer_name: string | null;
  watched_seconds: number;
  created_at: string;
  updated_at: string;
}

export default function InsightsPanel({ views, duration, totalViews }: { views: ViewRow[]; duration: number; totalViews: number }) {
  const d = duration > 0 ? duration : 1;
  const avg = views.length ? Math.round((views.reduce((a, v) => a + Math.min(1, v.watched_seconds / d), 0) / views.length) * 100) : 0;
  const stats = [
    { label: "Views", value: String(totalViews) },
    { label: "Tracked viewers", value: String(views.length) },
    { label: "Average watched", value: `${avg}%` },
  ];
  return (
    <div className="text-sm">
      <dl className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-background p-3">
            <dd className="text-xl font-semibold tabular-nums">{s.value}</dd>
            <dt className="mt-0.5 text-xs text-muted">{s.label}</dt>
          </div>
        ))}
      </dl>
      {views.length === 0 ? (
        <p className="mt-4 text-muted">No one has watched yet. Viewers appear here as they play the video.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {views.slice(0, 20).map((v) => {
            const pct = Math.min(100, Math.round((v.watched_seconds / d) * 100));
            return (
              <li key={v.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 truncate">{v.viewer_name || "Anonymous"}</span>
                <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-surface-muted sm:block" aria-hidden>
                  <span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                </span>
                <span className="w-24 text-right text-xs tabular-nums text-muted">
                  {pct}% · {formatTime(v.watched_seconds)}
                </span>
                <span className="w-16 text-right text-xs text-muted">{timeAgo(v.updated_at)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
