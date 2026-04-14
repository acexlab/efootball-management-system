"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { LeaderboardTable } from "@/components/ui/leaderboard-table";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { useAuthProfile } from "@/hooks/use-auth-profile";
import { mapClubLeaderboardRows } from "@/lib/supabase/club-leaderboard";
import { syncClubLeaderboardFromStats } from "@/lib/supabase/club-operations";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LeaderboardRow } from "@/lib/types";

type SortKey = "points" | "goals" | "wins";

export function LeaderboardPage() {
  const { session, profile } = useAuthProfile();
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>("points");
  const [tournamentFilter, setTournamentFilter] = useState("All tournaments");

  const loadLeaderboard = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();

    if (!supabase || !session) {
      setLeaderboard([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      await syncClubLeaderboardFromStats(supabase);
    } catch (syncError) {
      const detail = syncError instanceof Error ? syncError.message : "Leaderboard refresh failed.";
      setMessage(detail);
    }

    const { data, error } = await supabase
      .from("club_leaderboard")
      .select(
        "id, player_id, player_name, player_handle, club_name, image_url, matches, wins, draws, losses, goals_scored, goals_conceded, goal_difference, points"
      );

    if (error) {
      setMessage(`Leaderboard data is not ready yet. ${error.message}`);
      setLeaderboard([]);
      setLoading(false);
      return;
    }

    setLeaderboard(mapClubLeaderboardRows(data ?? []));
    setMessage("");
    setLoading(false);
  }, [profile.club, session]);

  const syncLeaderboard = useEffectEvent(() => {
    void loadLeaderboard();
  });

  useEffect(() => {
    syncLeaderboard();
  }, [session, profile.club]);

  const sortedRows = useMemo(() => {
    const sorted = [...leaderboard];
    if (sortBy === "points") {
      sorted.sort((a, b) => b.points - a.points || b.goals - a.goals || b.wins - a.wins);
    } else if (sortBy === "goals") {
      sorted.sort((a, b) => b.goals - a.goals || b.points - a.points || b.wins - a.wins);
    } else {
      sorted.sort((a, b) => b.wins - a.wins || b.points - a.points || b.goals - a.goals);
    }

    return sorted.map((item, index) => ({ ...item, rank: index + 1 }));
  }, [leaderboard, sortBy]);

  return (
    <div className="space-y-4">
      <Panel className="p-4">
        <SectionHeading
          eyebrow="Leaderboard"
          title="Rankings"
          description="Rank, player, goals, wins, and points with sortable controls."
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <select
            value={tournamentFilter}
            onChange={(event) => setTournamentFilter(event.target.value)}
            className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
          >
            <option>All tournaments</option>
          </select>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as SortKey)}
            className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
          >
            <option value="points">Sort: Points</option>
            <option value="goals">Sort: Goals</option>
            <option value="wins">Sort: Wins</option>
          </select>
        </div>
        {message ? (
          <div className="mt-3 rounded-lg border border-[#7A5CFF]/25 bg-[#7A5CFF]/10 px-3 py-2 text-xs text-[#E3DAFF]">
            {message}
          </div>
        ) : null}
      </Panel>

      <Panel className="p-4">
        {loading ? (
          <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-white/8 bg-black/20 text-sm text-[color:var(--text-muted)]">
            Loading leaderboard...
          </div>
        ) : sortedRows.length ? (
          <LeaderboardTable rows={sortedRows} />
        ) : (
          <EmptyState
            icon={Trophy}
            title={session ? "No leaderboard entries yet" : "Sign in to view leaderboard"}
            description={
              session
                ? "The leaderboard will populate after match results are saved."
                : "Authenticate first to load your club rankings."
            }
          />
        )}
      </Panel>
    </div>
  );
}
