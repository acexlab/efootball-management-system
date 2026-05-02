"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { LeaderboardTable } from "@/components/ui/leaderboard-table";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { useAuthProfile } from "@/hooks/use-auth-profile";
import { type LeaderboardSortKey, rankLeaderboardRows } from "@/lib/leaderboard";
import { syncClubLeaderboardFromStats } from "@/lib/supabase/club-operations";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LeaderboardRow } from "@/lib/types";

type LeaderboardScope = "all" | "inter_clan" | "intra_clan";

export function LeaderboardPage() {
  const { session } = useAuthProfile();
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<LeaderboardSortKey>("performance");
  const [tournamentFilter, setTournamentFilter] = useState<LeaderboardScope>("all");

  const loadLeaderboard = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setLeaderboard([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    if (session) {
      try {
        await syncClubLeaderboardFromStats(supabase);
      } catch (syncError) {
        const detail = syncError instanceof Error ? syncError.message : "Leaderboard refresh failed.";
        setMessage(detail);
      }
    }

    const [{ data: profileRows, error: profileError }, { data: tournamentRows, error: tournamentError }, { data: matchRows, error: matchError }, { data: statRows, error: statError }] =
      await Promise.all([
        supabase.from("profiles").select("id, full_name, gamer_tag, club_name, avatar_url"),
        supabase.from("tournaments").select("id, external_competition"),
        supabase.from("matches").select("id, tournament_id"),
        supabase.from("match_stats").select("match_id, player_id, goals, opponent_goals, result")
      ]);

    if (profileError || tournamentError || matchError || statError) {
      setMessage(`Leaderboard data is not ready yet. ${profileError?.message ?? tournamentError?.message ?? matchError?.message ?? statError?.message ?? ""}`.trim());
      setLeaderboard([]);
      setLoading(false);
      return;
    }

    const tournamentScopeMap = new Map(
      ((tournamentRows ?? []) as Array<{ id: string; external_competition: string | null }>).map((row) => [
        row.id,
        row.external_competition?.toLowerCase().includes("intra clan") ? "intra_clan" : "inter_clan"
      ])
    );
    const matchTournamentMap = new Map(
      ((matchRows ?? []) as Array<{ id: string; tournament_id: string | null }>).map((row) => [row.id, row.tournament_id ?? ""])
    );

    const rows = ((profileRows ?? []) as Array<{
      id: string;
      full_name: string | null;
      gamer_tag: string | null;
      club_name: string | null;
      avatar_url: string | null;
    }>).map<LeaderboardRow>((row) => ({
      id: row.id,
      name: row.full_name || row.gamer_tag || "Shield Member",
      handle: row.gamer_tag || row.full_name || "shield-member",
      team: row.club_name || "Shield Esports",
      position: "Shield Member",
      image: row.avatar_url || "",
      rating: 0,
      matches: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals: 0,
      conceded: 0,
      streak: "",
      points: 0,
      goalDifference: 0,
      rank: 0
    }));

    const rowMap = new Map(rows.map((row) => [row.id, row]));

    for (const stat of (statRows ?? []) as Array<{ match_id: string; player_id: string; goals: number | null; opponent_goals: number | null; result: string | null }>) {
      const tournamentId = matchTournamentMap.get(stat.match_id) ?? "";
      const scope = tournamentScopeMap.get(tournamentId) ?? "inter_clan";
      if (tournamentFilter !== "all" && scope !== tournamentFilter) continue;

      const row = rowMap.get(stat.player_id);
      if (!row) continue;

      row.matches += 1;
      row.goals += Number(stat.goals ?? 0);
      row.conceded += Number(stat.opponent_goals ?? 0);

      if (stat.result === "win") {
        row.wins += 1;
        row.points += 3;
      } else if (stat.result === "draw") {
        row.draws += 1;
        row.points += 1;
      } else if (stat.result === "loss") {
        row.losses += 1;
      }

      row.goalDifference = row.goals - row.conceded;
    }

    setLeaderboard(rows);
    setMessage("");
    setLoading(false);
  }, [session, tournamentFilter]);

  const syncLeaderboard = useEffectEvent(() => {
    void loadLeaderboard();
  });

  useEffect(() => {
    syncLeaderboard();
  }, [session, tournamentFilter]);

  const sortedRows = useMemo(() => rankLeaderboardRows(leaderboard, sortBy), [leaderboard, sortBy]);

  return (
    <div className="space-y-4">
      <Panel className="p-4">
        <SectionHeading
          eyebrow="Leaderboard"
          title="Rankings"
          description="Default ranking uses a performance score that rewards wins, draws, goals, and goal difference while penalizing losses."
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <select value={tournamentFilter} onChange={(event) => setTournamentFilter(event.target.value as LeaderboardScope)} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white">
            <option value="all">All tournaments</option>
            <option value="inter_clan">Inter clan tournaments</option>
            <option value="intra_clan">Intra clan tournaments</option>
          </select>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value as LeaderboardSortKey)} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white">
            <option value="performance">Sort: Performance</option>
            <option value="points">Sort: Points</option>
            <option value="goals">Sort: Goals</option>
            <option value="wins">Sort: Wins</option>
          </select>
        </div>
        {sortBy === "performance" ? <p className="mt-3 text-xs text-[color:var(--text-muted)]">Performance balances wins, draws, goals, and goal difference, and pushes loss-only records below players who have not played yet.</p> : null}
        {message ? <div className="mt-3 rounded-lg border border-[#7A5CFF]/25 bg-[#7A5CFF]/10 px-3 py-2 text-xs text-[#E3DAFF]">{message}</div> : null}
      </Panel>

      <Panel className="p-4">
        {loading ? (
          <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-white/8 bg-black/20 text-sm text-[color:var(--text-muted)]">Loading leaderboard...</div>
        ) : sortedRows.some((row) => row.matches > 0) ? (
          <LeaderboardTable rows={sortedRows.filter((row) => row.matches > 0 || tournamentFilter === "all")} />
        ) : (
          <EmptyState icon={Trophy} title="No leaderboard entries yet" description="The leaderboard will populate after match results are saved for the selected tournament scope." />
        )}
      </Panel>
    </div>
  );
}
