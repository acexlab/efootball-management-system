"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { Activity, BarChart3, FileBarChart2, ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function ReportsPage() {
  const [metrics, setMetrics] = useState([
    { label: "Members", value: 0 },
    { label: "Tournaments", value: 0 },
    { label: "Matches", value: 0 },
    { label: "Leaderboard Rows", value: 0 }
  ]);
  const [message, setMessage] = useState("");

  const loadMetrics = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) return;

    const [profiles, tournaments, matches, leaderboard] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase.from("tournaments").select("*", { count: "exact", head: true }),
      supabase.from("matches").select("*", { count: "exact", head: true }),
      supabase.from("club_leaderboard").select("*", { count: "exact", head: true })
    ]);

    if (profiles.error || tournaments.error || matches.error || leaderboard.error) {
      setMessage("Reports will become available after the tournament tables and leaderboard records are active.");
      return;
    }

    setMetrics([
      { label: "Members", value: profiles.count ?? 0 },
      { label: "Tournaments", value: tournaments.count ?? 0 },
      { label: "Matches", value: matches.count ?? 0 },
      { label: "Leaderboard Rows", value: leaderboard.count ?? 0 }
    ]);
    setMessage("");
  }, []);

  const syncMetrics = useEffectEvent(() => {
    void loadMetrics();
  });

  useEffect(() => {
    syncMetrics();
  }, []);

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Panel className="p-6">
        <SectionHeading
          eyebrow="Analyst room"
          title="Reports"
          description="System reporting now reflects real table counts and setup progress instead of fabricated analyst cards."
        />
        {message ? (
          <div className="mt-6 rounded-[24px] border border-[#7A5CFF]/25 bg-[#7A5CFF]/10 px-4 py-3 text-sm text-[#E3DAFF]">
            {message}
          </div>
        ) : null}
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {metrics.map((metric, index) => (
            <MetricCard
              key={metric.label}
              icon={index === 0 ? Activity : index === 1 ? FileBarChart2 : index === 2 ? ShieldAlert : BarChart3}
              label={metric.label}
              value={metric.value}
            />
          ))}
        </div>
      </Panel>

      <Panel className="p-6">
        <SectionHeading
          eyebrow="Trend"
          title="Performance Graph"
          description="A restrained activity rail that becomes more meaningful as the system fills with real competition data."
        />
        {metrics.every((metric) => metric.value === 0) ? (
          <div className="mt-8">
            <EmptyState
              icon={BarChart3}
              title="No reportable activity yet"
              description="Once users, tournaments, matches, and leaderboard entries begin populating, this space can evolve into trend charts and performance analysis."
            />
          </div>
        ) : (
          <div className="mt-8 flex h-[320px] items-end gap-4 rounded-[28px] border border-white/8 bg-black/20 p-6">
            {metrics.map((metric) => {
              const height = Math.max(metric.value * 18, 18);
              return (
                <div key={metric.label} className="flex flex-1 flex-col items-center gap-3">
                  <div
                    className="w-full rounded-t-[18px] bg-gradient-to-t from-[#00FF88] via-[#00D4FF] to-[#7A5CFF]"
                    style={{ height: `${Math.min(height, 100)}%` }}
                  />
                  <span className="text-center text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                    {metric.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <article className="rounded-[24px] border border-white/8 bg-black/20 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">{label}</p>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <Icon className="h-4 w-4 text-[#00D4FF]" />
        </div>
      </div>
      <p className="mt-4 text-4xl font-black text-white">{value}</p>
    </article>
  );
}
