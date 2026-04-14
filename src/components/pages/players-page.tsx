"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusPill } from "@/components/ui/status-pill";
import { UserAvatar } from "@/components/ui/user-avatar";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type { Role } from "@/lib/types";

type ProfileRow = {
  id: string;
  full_name: string | null;
  gamer_tag: string | null;
  role: Role | null;
  avatar_url: string | null;
  club_name: string | null;
};

type PlayerRow = {
  id: string;
  name: string;
  handle: string;
  role: Role;
  club: string;
  avatarUrl: string | null;
  matches: number;
  goals: number;
  points: number;
  wins: number;
  draws: number;
  winPct: number;
  trend: number[];
};

export function PlayersPage() {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(hasSupabaseConfig());
  const [message, setMessage] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerRow | null>(null);

  const loadPlayers = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setPlayers([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, gamer_tag, role, avatar_url, club_name")
      .order("created_at", { ascending: true });

    if (error) {
      setMessage(`Player profiles are unavailable until full-management-setup.sql is active. ${error.message}`);
      setPlayers([]);
      setLoading(false);
      return;
    }

    const profileRows = (data ?? []) as ProfileRow[];

    const { data: leaderboardRows } = await supabase
      .from("club_leaderboard")
      .select("player_id, matches, wins, draws, goals_scored, points");

    const statsMap = Object.fromEntries(
      (leaderboardRows ?? []).map((row) => [
        row.player_id as string,
        {
          matches: row.matches as number,
          wins: row.wins as number,
          draws: row.draws as number,
          goals: row.goals_scored as number,
          points: (row.points as number | null) ?? (((row.wins as number) * 3) + (row.draws as number))
        }
      ])
    );

    const { data: matchRows } = await supabase
      .from("matches")
      .select("id, match_number, created_at, scheduled_at");

    const matchMap = Object.fromEntries(
      (matchRows ?? []).map((match) => [
        match.id as string,
        {
          matchNumber: (match.match_number as number | null) ?? 0,
          createdAt: (match.created_at as string | null) ?? "",
          scheduledAt: (match.scheduled_at as string | null) ?? ""
        }
      ])
    );

    const { data: statRows } = await supabase
      .from("match_stats")
      .select("player_id, goals, result, match_id");

    const perPlayerStats = (statRows ?? []).reduce<Record<string, Array<{
      goals: number;
      result: "win" | "draw" | "loss";
      matchId: string;
    }>>>((acc, row) => {
      const playerId = row.player_id as string;
      if (!playerId) return acc;
      if (!acc[playerId]) acc[playerId] = [];
      acc[playerId].push({
        goals: (row.goals as number | null) ?? 0,
        result: row.result as "win" | "draw" | "loss",
        matchId: row.match_id as string
      });
      return acc;
    }, {});

    setPlayers(
      profileRows.map((profile) => ({
        id: profile.id,
        name: profile.full_name || profile.gamer_tag || "Shield Member",
        handle: profile.gamer_tag || profile.full_name || "member",
        role: profile.role ?? "Player",
        club: profile.club_name || "Shield Esports",
        avatarUrl: profile.avatar_url,
        matches: statsMap[profile.id]?.matches ?? 0,
        wins: statsMap[profile.id]?.wins ?? 0,
        draws: statsMap[profile.id]?.draws ?? 0,
        goals: statsMap[profile.id]?.goals ?? 0,
        points: statsMap[profile.id]?.points ?? 0,
        winPct: calculateWinPct(statsMap[profile.id]?.wins ?? 0, statsMap[profile.id]?.matches ?? 0),
        trend: buildTrendSeriesFromStats(perPlayerStats[profile.id] ?? [], matchMap)
      }))
    );
    setMessage("");
    setLoading(false);
  }, []);

  const syncPlayers = useEffectEvent(() => {
    void loadPlayers();
  });

  useEffect(() => {
    syncPlayers();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const refreshPlayers = () => {
      syncPlayers();
    };

    window.addEventListener("efcms:profile-updated", refreshPlayers);
    return () => {
      window.removeEventListener("efcms:profile-updated", refreshPlayers);
    };
  }, []);

  return (
    <div className="space-y-6">
      <Panel className="p-5 sm:p-6">
        <SectionHeading
          eyebrow="Squad roster"
          title="Players"
          description="Signed-up club members are shown here with their real profile photo, in-game name, role, and live stats."
        />
        {message ? (
          <div className="mt-6 rounded-[24px] border border-[#7A5CFF]/25 bg-[#7A5CFF]/10 px-4 py-3 text-sm text-[#E3DAFF]">
            {message}
          </div>
        ) : null}
      </Panel>

      <Panel className="p-5 sm:p-6">
        {loading ? (
          <div className="flex min-h-[260px] items-center justify-center rounded-[28px] border border-white/8 bg-black/20 text-sm text-[color:var(--text-muted)]">
            Loading player roster...
          </div>
        ) : players.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {players.map((player) => (
              <button
                type="button"
                key={player.id}
                onClick={() => setSelectedPlayer(player)}
                className="group w-full overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-5 text-left transition hover:border-[#00D4FF]/30 hover:bg-white/[0.04]"
              >
                <div className="flex items-start gap-4">
                  <UserAvatar src={player.avatarUrl} name={player.name} className="h-24 w-24 rounded-[24px]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">{player.club}</p>
                    <h3 className="mt-2 truncate text-2xl font-semibold text-white">{player.handle}</h3>
                    <p className="truncate text-sm text-[color:var(--text-muted)]">{player.name}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <StatusPill label={player.role} tone={roleTone(player.role)} />
                      <StatusPill label={`${player.points} PTS`} tone="success" />
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <StatCard label="Goals" value={player.goals} />
                  <StatCard label="Win %" value={player.winPct} suffix="%" />
                  <OutcomeCard wins={player.wins} draws={player.draws} losses={Math.max(player.matches - player.wins - player.draws, 0)} />
                </div>
                <p className="mt-4 text-xs uppercase tracking-[0.24em] text-[#00D4FF]/80">
                  View performance
                </p>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title="No players have signed in yet"
            description="Once members authenticate and save their profile, their roster cards and photos will appear here."
          />
        )}
      </Panel>

      {selectedPlayer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setSelectedPlayer(null)}
            aria-label="Close player performance"
          />
          <div className="relative w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/10 bg-[#0b0f14] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <UserAvatar
                  src={selectedPlayer.avatarUrl}
                  name={selectedPlayer.name}
                  className="h-20 w-20 rounded-[20px]"
                />
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                    {selectedPlayer.club}
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">{selectedPlayer.handle}</h3>
                  <p className="text-sm text-[color:var(--text-muted)]">{selectedPlayer.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlayer(null)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white"
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">Performance trend</p>
                  <span className="text-xs text-[#00FF88]">Rising form</span>
                </div>
                <PerformanceChart player={selectedPlayer} />
              </div>
              <div className="grid gap-3">
                <StatCard label="Goals" value={selectedPlayer.goals} />
                <StatCard label="Win %" value={selectedPlayer.winPct} suffix="%" />
                <OutcomeCard
                  wins={selectedPlayer.wins}
                  draws={selectedPlayer.draws}
                  losses={Math.max(selectedPlayer.matches - selectedPlayer.wins - selectedPlayer.draws, 0)}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function roleTone(role: Role) {
  if (role === "Super Admin") return "success";
  if (role === "Admin") return "info";
  if (role === "Captain") return "warning";
  return "neutral";
}

function StatCard({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-[20px] border border-white/8 bg-black/20 px-3 py-4 text-center">
      <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">{label}</p>
      <p className="mt-3 text-2xl font-black text-white">
        {value}
        {suffix ? <span className="text-sm font-semibold text-[color:var(--text-muted)]">{suffix}</span> : null}
      </p>
    </div>
  );
}

function calculateWinPct(wins: number, matches: number) {
  if (!matches) return 0;
  return Math.round((wins / matches) * 100);
}

function OutcomeCard({ wins, draws, losses }: { wins: number; draws: number; losses: number }) {
  return (
    <div className="rounded-[20px] border border-white/8 bg-black/20 px-3 py-4 text-center sm:col-span-2">
      <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">W • D • L</p>
      <div className="mt-3 flex items-center justify-center gap-3 text-lg font-semibold text-white">
        <span className="rounded-full border border-[#00FF88]/30 bg-[#00FF88]/10 px-3 py-1 text-xs font-semibold text-[#00FF88]">
          {wins} W
        </span>
        <span className="rounded-full border border-[#00D4FF]/30 bg-[#00D4FF]/10 px-3 py-1 text-xs font-semibold text-[#00D4FF]">
          {draws} D
        </span>
        <span className="rounded-full border border-[#FF5470]/30 bg-[#FF5470]/10 px-3 py-1 text-xs font-semibold text-[#FF5470]">
          {losses} L
        </span>
      </div>
    </div>
  );
}

function PerformanceChart({ player }: { player: PlayerRow }) {
  const series = player.trend.length ? player.trend : buildDefaultTrendSeries();
  const maxValue = Math.max(...series, 1);
  const minValue = Math.min(...series, 0);
  const range = maxValue - minValue || 1;

  const points = series.map((value, index) => {
    const x = (index / (series.length - 1)) * 100;
    const y = 40 - ((value - minValue) / range) * 40;
    return { x, y };
  });

  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const areaPath = `${linePath} L 100 40 L 0 40 Z`;

  return (
    <div className="mt-4">
      <svg viewBox="0 0 100 40" className="h-28 w-full">
        <defs>
          <linearGradient id="shield-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#00FF88" />
            <stop offset="50%" stopColor="#00D4FF" />
            <stop offset="100%" stopColor="#7A5CFF" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#shield-line)" opacity="0.12" />
        <path d={linePath} fill="none" stroke="url(#shield-line)" strokeWidth="2" />
        {points.map((point, index) => (
          <circle key={index} cx={point.x} cy={point.y} r="1.5" fill="#00FF88" opacity={index === points.length - 1 ? 1 : 0.6} />
        ))}
      </svg>
      <div className="mt-3 flex items-center justify-between text-xs text-[color:var(--text-muted)]">
        <span>Start</span>
        <span>Current</span>
      </div>
    </div>
  );
}

function buildDefaultTrendSeries() {
  return Array.from({ length: 10 }, () => 0);
}

function buildTrendSeriesFromStats(
  stats: Array<{ goals: number; result: "win" | "draw" | "loss"; matchId: string }>,
  matchMap: Record<string, { matchNumber: number; createdAt: string; scheduledAt: string }>
) {
  if (!stats.length) return buildDefaultTrendSeries();

  const ordered = [...stats].sort((a, b) => {
    const matchA = matchMap[a.matchId];
    const matchB = matchMap[b.matchId];
    const numberDiff = (matchA?.matchNumber ?? 0) - (matchB?.matchNumber ?? 0);
    if (numberDiff !== 0) return numberDiff;
    const dateA = new Date(matchA?.scheduledAt || matchA?.createdAt || 0).getTime();
    const dateB = new Date(matchB?.scheduledAt || matchB?.createdAt || 0).getTime();
    return dateA - dateB;
  });

  const cumulative: number[] = [];
  let total = 0;
  for (const item of ordered) {
    total += item.result === "win" ? 3 : item.result === "draw" ? 1 : 0;
    cumulative.push(total);
  }

  if (cumulative.length >= 10) {
    return cumulative.slice(-10);
  }

  const padding = Array.from({ length: 10 - cumulative.length }, () => (cumulative[0] ?? 0));
  return [...padding, ...cumulative];
}
