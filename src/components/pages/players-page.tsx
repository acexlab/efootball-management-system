"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";
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

type TournamentOption = {
  id: string;
  name: string;
};

type TournamentStat = {
  tournamentId: string;
  tournamentName: string;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  conceded: number;
  points: number;
  winPct: number;
  trend: number[];
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
  losses: number;
  conceded: number;
  winPct: number;
  trend: number[];
  tournamentStats: TournamentStat[];
};

export function PlayersPage() {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(hasSupabaseConfig());
  const [message, setMessage] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerRow | null>(null);
  const [selectedTournamentFilter, setSelectedTournamentFilter] = useState("all");

  const loadPlayers = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setPlayers([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const [{ data: profilesData, error: profilesError }, { data: tournamentRows, error: tournamentError }, { data: matchRows, error: matchError }, { data: statRows, error: statError }] =
      await Promise.all([
        supabase.from("profiles").select("id, full_name, gamer_tag, role, avatar_url, club_name").order("created_at", { ascending: true }),
        supabase.from("tournaments").select("id, name"),
        supabase.from("matches").select("id, tournament_id, match_number, created_at, scheduled_at"),
        supabase.from("match_stats").select("player_id, goals, opponent_goals, result, match_id")
      ]);

    if (profilesError || tournamentError || matchError || statError) {
      setMessage(
        `Player profiles are unavailable until full-management-setup.sql is active. ${
          profilesError?.message ?? tournamentError?.message ?? matchError?.message ?? statError?.message ?? ""
        }`.trim()
      );
      setPlayers([]);
      setLoading(false);
      return;
    }

    const profileRows = (profilesData ?? []) as ProfileRow[];
    const tournamentMap = Object.fromEntries(((tournamentRows ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]));
    const matchMap = Object.fromEntries(
      ((matchRows ?? []) as Array<{ id: string; tournament_id: string | null; match_number: number | null; created_at: string | null; scheduled_at: string | null }>).map((match) => [
        match.id,
        {
          tournamentId: match.tournament_id ?? "",
          matchNumber: match.match_number ?? 0,
          createdAt: match.created_at ?? "",
          scheduledAt: match.scheduled_at ?? ""
        }
      ])
    );

    const perPlayerStats = ((statRows ?? []) as Array<{ player_id: string; goals: number | null; opponent_goals: number | null; result: "win" | "draw" | "loss" | null; match_id: string }>)
      .reduce<Record<string, Array<{ goals: number; opponentGoals: number; result: "win" | "draw" | "loss"; matchId: string }>>>((acc, row) => {
        const playerId = row.player_id;
        if (!playerId || !row.result) return acc;
        if (!acc[playerId]) acc[playerId] = [];
        acc[playerId].push({
          goals: row.goals ?? 0,
          opponentGoals: row.opponent_goals ?? 0,
          result: row.result,
          matchId: row.match_id
        });
        return acc;
      }, {});

    const nextPlayers = profileRows.map((profile) => {
      const stats = perPlayerStats[profile.id] ?? [];
      const tournamentStatsMap = new Map<
        string,
        { tournamentId: string; tournamentName: string; matches: number; wins: number; draws: number; losses: number; goals: number; conceded: number; points: number; items: Array<{ goals: number; result: "win" | "draw" | "loss"; matchId: string }> }
      >();

      for (const item of stats) {
        const match = matchMap[item.matchId];
        const tournamentId = match?.tournamentId ?? "";
        if (!tournamentId) continue;
        const current = tournamentStatsMap.get(tournamentId) ?? {
          tournamentId,
          tournamentName: tournamentMap[tournamentId] ?? "Tournament",
          matches: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goals: 0,
          conceded: 0,
          points: 0,
          items: []
        };

        current.matches += 1;
        current.goals += item.goals;
        current.conceded += item.opponentGoals;
        current.items.push({ goals: item.goals, result: item.result, matchId: item.matchId });

        if (item.result === "win") {
          current.wins += 1;
          current.points += 3;
        } else if (item.result === "draw") {
          current.draws += 1;
          current.points += 1;
        } else {
          current.losses += 1;
        }

        tournamentStatsMap.set(tournamentId, current);
      }

      const matches = stats.length;
      const wins = stats.filter((item) => item.result === "win").length;
      const draws = stats.filter((item) => item.result === "draw").length;
      const losses = stats.filter((item) => item.result === "loss").length;
      const goals = stats.reduce((sum, item) => sum + item.goals, 0);
      const conceded = stats.reduce((sum, item) => sum + item.opponentGoals, 0);
      const points = wins * 3 + draws;

      return {
        id: profile.id,
        name: profile.full_name || profile.gamer_tag || "Shield Member",
        handle: profile.gamer_tag || profile.full_name || "member",
        role: profile.role ?? "Player",
        club: profile.club_name || "Shield Esports",
        avatarUrl: profile.avatar_url,
        matches,
        wins,
        draws,
        losses,
        goals,
        conceded,
        points,
        winPct: calculateWinPct(wins, matches),
        trend: buildTrendSeriesFromStats(stats, matchMap),
        tournamentStats: [...tournamentStatsMap.values()]
          .map((item) => ({
            tournamentId: item.tournamentId,
            tournamentName: item.tournamentName,
            matches: item.matches,
            wins: item.wins,
            draws: item.draws,
            losses: item.losses,
            goals: item.goals,
            conceded: item.conceded,
            points: item.points,
            winPct: calculateWinPct(item.wins, item.matches),
            trend: buildTrendSeriesFromStats(item.items, matchMap)
          }))
          .sort((a, b) => b.points - a.points || b.goals - a.goals || a.tournamentName.localeCompare(b.tournamentName))
      };
    });

    setPlayers(nextPlayers);
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

  const selectedTournamentStats = useMemo(() => {
    if (!selectedPlayer) return null;
    if (selectedTournamentFilter === "all") return null;
    return selectedPlayer.tournamentStats.find((item) => item.tournamentId === selectedTournamentFilter) ?? null;
  }, [selectedPlayer, selectedTournamentFilter]);

  const tournamentOptions = selectedPlayer?.tournamentStats.map((item) => ({
    label: item.tournamentName,
    value: item.tournamentId
  })) ?? [];

  const detailStats = selectedTournamentStats
    ? {
        goals: selectedTournamentStats.goals,
        winPct: selectedTournamentStats.winPct,
        wins: selectedTournamentStats.wins,
        draws: selectedTournamentStats.draws,
        losses: selectedTournamentStats.losses,
        trend: selectedTournamentStats.trend,
        matches: selectedTournamentStats.matches,
        points: selectedTournamentStats.points,
        label: selectedTournamentStats.tournamentName
      }
    : selectedPlayer
      ? {
          goals: selectedPlayer.goals,
          winPct: selectedPlayer.winPct,
          wins: selectedPlayer.wins,
          draws: selectedPlayer.draws,
          losses: selectedPlayer.losses,
          trend: selectedPlayer.trend,
          matches: selectedPlayer.matches,
          points: selectedPlayer.points,
          label: "All tournaments"
        }
      : null;

  return (
    <div className="space-y-6">
      <Panel className="p-5 sm:p-6">
        <SectionHeading
          eyebrow="Squad roster"
          title="Players"
          description="Signed-up club members are shown here with their real profile photo, in-game name, role, live stats, and tournament-by-tournament performance."
        />
        {message ? <div className="mt-6 rounded-[24px] border border-[#7A5CFF]/25 bg-[#7A5CFF]/10 px-4 py-3 text-sm text-[#E3DAFF]">{message}</div> : null}
      </Panel>

      <Panel className="p-5 sm:p-6">
        {loading ? (
          <div className="flex min-h-[260px] items-center justify-center rounded-[28px] border border-white/8 bg-black/20 text-sm text-[color:var(--text-muted)]">Loading player roster...</div>
        ) : players.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {players.map((player) => (
              <button
                type="button"
                key={player.id}
                onClick={() => {
                  setSelectedPlayer(player);
                  setSelectedTournamentFilter("all");
                }}
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
                  <OutcomeCard wins={player.wins} draws={player.draws} losses={player.losses} />
                </div>
                <p className="mt-4 text-xs uppercase tracking-[0.24em] text-[#00D4FF]/80">View performance by tournament</p>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState icon={Users} title="No players have signed in yet" description="Once members authenticate and save their profile, their roster cards and photos will appear here." />
        )}
      </Panel>

      {selectedPlayer && detailStats ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
          <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSelectedPlayer(null)} aria-label="Close player performance" />
          <div className="relative w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/10 bg-[#0b0f14] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <UserAvatar src={selectedPlayer.avatarUrl} name={selectedPlayer.name} className="h-20 w-20 rounded-[20px]" />
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">{selectedPlayer.club}</p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">{selectedPlayer.handle}</h3>
                  <p className="text-sm text-[color:var(--text-muted)]">{selectedPlayer.name}</p>
                </div>
              </div>
              <button type="button" onClick={() => setSelectedPlayer(null)} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white">
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white">
                Showing: <span className="font-semibold">{detailStats.label}</span>
              </div>
              <select value={selectedTournamentFilter} onChange={(event) => setSelectedTournamentFilter(event.target.value)} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-[#00D4FF]/30">
                <option value="all">All tournaments</option>
                {tournamentOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">Performance trend</p>
                  <span className="text-xs text-[#00FF88]">{detailStats.points} pts</span>
                </div>
                <PerformanceChart series={detailStats.trend} />
              </div>
              <div className="grid gap-3">
                <StatCard label="Goals" value={detailStats.goals} />
                <StatCard label="Win %" value={detailStats.winPct} suffix="%" />
                <StatCard label="Matches" value={detailStats.matches} />
                <OutcomeCard wins={detailStats.wins} draws={detailStats.draws} losses={detailStats.losses} />
              </div>
            </div>

            {selectedPlayer.tournamentStats.length ? (
              <div className="mt-6 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <p className="text-sm font-semibold text-white">Tournament breakdown</p>
                <div className="mt-4 grid gap-3">
                  {selectedPlayer.tournamentStats.map((item) => (
                    <button
                      key={item.tournamentId}
                      type="button"
                      onClick={() => setSelectedTournamentFilter(item.tournamentId)}
                      className={`grid gap-3 rounded-2xl border p-4 text-left md:grid-cols-[minmax(0,1fr)_repeat(4,auto)] ${
                        selectedTournamentFilter === item.tournamentId
                          ? "border-[#00FF88]/30 bg-[#00FF88]/10"
                          : "border-white/8 bg-black/20"
                      }`}
                    >
                      <div>
                        <p className="font-semibold text-white">{item.tournamentName}</p>
                        <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                          {item.wins}W • {item.draws}D • {item.losses}L
                        </p>
                      </div>
                      <span className="text-sm text-white">{item.points} pts</span>
                      <span className="text-sm text-white">{item.goals} goals</span>
                      <span className="text-sm text-white">{item.matches} matches</span>
                      <span className="text-sm text-white">{item.winPct}% win</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
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
        <span className="rounded-full border border-[#00FF88]/30 bg-[#00FF88]/10 px-3 py-1 text-xs font-semibold text-[#00FF88]">{wins} W</span>
        <span className="rounded-full border border-[#00D4FF]/30 bg-[#00D4FF]/10 px-3 py-1 text-xs font-semibold text-[#00D4FF]">{draws} D</span>
        <span className="rounded-full border border-[#FF5470]/30 bg-[#FF5470]/10 px-3 py-1 text-xs font-semibold text-[#FF5470]">{losses} L</span>
      </div>
    </div>
  );
}

function PerformanceChart({ series }: { series: number[] }) {
  const safeSeries = series.length ? series : buildDefaultTrendSeries();
  const maxValue = Math.max(...safeSeries, 1);
  const minValue = Math.min(...safeSeries, 0);
  const range = maxValue - minValue || 1;
  const points = safeSeries.map((value, index) => {
    const x = (index / (safeSeries.length - 1)) * 100;
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
  matchMap: Record<string, { tournamentId: string; matchNumber: number; createdAt: string; scheduledAt: string }>
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
  if (cumulative.length >= 10) return cumulative.slice(-10);
  const padding = Array.from({ length: 10 - cumulative.length }, () => cumulative[0] ?? 0);
  return [...padding, ...cumulative];
}
