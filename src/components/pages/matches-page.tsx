"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";
import { Swords } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { MatchCard } from "@/components/ui/match-card";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { useAuthProfile } from "@/hooks/use-auth-profile";
import { hasPermission } from "@/lib/rbac";
import { syncClubLeaderboardFromStats } from "@/lib/supabase/club-operations";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type { ClubMatch } from "@/lib/types";

export function MatchesPage() {
  const { session, profile } = useAuthProfile();
  const [matches, setMatches] = useState<ClubMatch[]>([]);
  const [loading, setLoading] = useState(hasSupabaseConfig());
  const [message, setMessage] = useState("");
  const [deletingMatchId, setDeletingMatchId] = useState<string | null>(null);
  const [tournamentFilter, setTournamentFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");

  const loadMatches = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();

    if (!session || !supabase) {
      setMatches([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const adminLike = hasPermission(profile.role, "manage:tournaments");
    let manageableTournamentIds: string[] = [];

    if (!adminLike) {
      const { data: manageableRows, error: manageableError } = await supabase
        .from("tournament_participants")
        .select("tournament_id")
        .eq("user_id", session.user.id)
        .in("role", ["captain", "vice_captain"]);

      if (manageableError) {
        setMessage(`Match permissions could not be loaded. ${manageableError.message}`);
      } else {
        manageableTournamentIds = (manageableRows ?? []).map((item) => item.tournament_id);
      }
    }

    const [
      { data: matchRows, error: matchesError },
      { data: profiles, error: profilesError },
      { data: tournaments, error: tournamentsError },
      { data: statsRows, error: statsError }
    ] = await Promise.all([
        supabase
          .from("matches")
          .select(
            "id, home_player_id, away_player_id, home_score, away_score, scheduled_at, venue, status, tournament_id, match_number, opponent_team"
          )
          .order("scheduled_at", { ascending: false }),
        supabase.from("profiles").select("id, full_name, gamer_tag"),
        supabase.from("tournaments").select("id, name, home_team_name"),
        supabase.from("match_stats").select("match_id, goals, result")
      ]);

    if (matchesError || profilesError || tournamentsError || statsError) {
      setMessage(
        `Match data is unavailable until the full management schema is active. ${
          matchesError?.message ?? profilesError?.message ?? tournamentsError?.message ?? statsError?.message ?? ""
        }`.trim()
      );
      setMatches([]);
      setLoading(false);
      return;
    }

    const profileMap = Object.fromEntries(
      (profiles ?? []).map((item) => [item.id, item.gamer_tag || item.full_name || "Player"])
    );
    const tournamentMap = Object.fromEntries((tournaments ?? []).map((item) => [item.id, item.name]));
    const tournamentTeamMap = Object.fromEntries(
      (tournaments ?? []).map((item) => [item.id, item.home_team_name || "Shield Entity"])
    );

    const statsByMatch = (statsRows ?? []).reduce<Record<string, Array<{ goals: number; result: string }>>>(
      (acc, row) => {
        const matchId = row.match_id as string;
        if (!matchId) return acc;
        if (!acc[matchId]) acc[matchId] = [];
        acc[matchId].push({
          goals: (row.goals as number | null) ?? 0,
          result: String(row.result ?? "").toLowerCase()
        });
        return acc;
      },
      {}
    );

    const normalizedMatches = (matchRows ?? []).map((match) => {
      const matchStats = statsByMatch[match.id] ?? [];
      const homePoints = matchStats.reduce((sum, stat) => {
        if (stat.result === "win") return sum + 3;
        if (stat.result === "draw") return sum + 1;
        return sum;
      }, 0);

      const awayPoints = matchStats.reduce((sum, stat) => {
        if (stat.result === "loss") return sum + 3;
        if (stat.result === "draw") return sum + 1;
        return sum;
      }, 0);

      const homeTeam = tournamentTeamMap[match.tournament_id] ?? "Shield Entity";
      const awayTeam = match.opponent_team || "Opponent Team";

      return {
        match,
        homePoints,
        awayPoints,
        homeTeam,
        awayTeam
      };
    });

    setMatches(
        normalizedMatches.map(({ match, homePoints, awayPoints, homeTeam, awayTeam }) => {
          return ({
          id: match.id,
          tournamentId: match.tournament_id,
          matchNumber: (match as { match_number?: number | null }).match_number ?? undefined,
          home: homeTeam,
          away: awayTeam,
          homeScore: homePoints,
          awayScore: 0,
          homePoints,
          awayPoints,
        date: match.scheduled_at ? new Date(match.scheduled_at).toLocaleString() : "Not scheduled",
        status: normalizeMatchStatus(match.status),
        venue: match.venue || "Shield Arena",
          tournament: tournamentMap[match.tournament_id] ?? "Tournament",
          slots: [profileMap[match.home_player_id] ?? "Slot 1", profileMap[match.away_player_id] ?? "Slot 2"],
          canDelete: adminLike || manageableTournamentIds.includes(match.tournament_id)
          });
        })
    );
    setMessage("");
    setLoading(false);
  }, [profile.role, session]);

  const syncMatches = useEffectEvent(() => {
    void loadMatches();
  });

  useEffect(() => {
    syncMatches();
  }, [session]);

  async function handleDeleteMatch(match: ClubMatch) {
    if (!match.canDelete) return;

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`Delete the saved result for ${match.home} vs ${match.away}?`);
      if (!confirmed) return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setDeletingMatchId(match.id);
    setMessage("");

    const { error } = await supabase.from("matches").delete().eq("id", match.id);

    if (error) {
      setMessage(`Match result could not be deleted: ${error.message}`);
      setDeletingMatchId(null);
      return;
    }

    try {
      await syncClubLeaderboardFromStats(supabase);
    } catch (leaderboardError) {
      const detail = leaderboardError instanceof Error ? leaderboardError.message : "Unknown error";
      setMessage(`Match deleted, but leaderboard sync failed: ${detail}`);
      setDeletingMatchId(null);
      await loadMatches();
      return;
    }

    setMessage("Match result deleted successfully.");
    setDeletingMatchId(null);
    await loadMatches();
  }

  const tournamentOptions = useMemo(
    () => Array.from(new Set(matches.map((match) => match.tournament))).sort((a, b) => a.localeCompare(b)),
    [matches]
  );

  const teamOptions = useMemo(
    () =>
      Array.from(
        new Set(
          matches.flatMap((match) => [match.home, match.away]).filter((team): team is string => Boolean(team))
        )
      ).sort((a, b) => a.localeCompare(b)),
    [matches]
  );

  const visibleMatches = useMemo(
    () =>
      matches.filter((match) => {
        const tournamentMatch = tournamentFilter === "all" || match.tournament === tournamentFilter;
        const teamMatch = teamFilter === "all" || match.home === teamFilter || match.away === teamFilter;
        return tournamentMatch && teamMatch;
      }),
    [matches, teamFilter, tournamentFilter]
  );

  return (
    <div className="space-y-4">
      <Panel className="p-4 sm:p-5">
        <SectionHeading
          eyebrow="Fixtures"
          title="Matches"
          description="Track match number, slot players, status, and jump to result entry. Filter by tournament or team to narrow the result archive."
        />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <SelectField
            label="Tournament filter"
            value={tournamentFilter}
            onChange={setTournamentFilter}
            options={tournamentOptions}
            allLabel="All tournaments"
          />
          <SelectField label="Team filter" value={teamFilter} onChange={setTeamFilter} options={teamOptions} allLabel="All teams" />
        </div>
        {message ? (
          <div className="mt-4 sm:mt-5 md:mt-6 rounded-lg sm:rounded-xl md:rounded-[24px] border border-[#7A5CFF]/25 bg-[#7A5CFF]/10 px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-[#E3DAFF]">
            {message}
          </div>
        ) : null}
        {loading ? (
          <div className="mt-4 sm:mt-5 md:mt-6 flex min-h-[240px] sm:min-h-[260px] md:min-h-[280px] items-center justify-center rounded-lg sm:rounded-xl md:rounded-[28px] border border-white/8 bg-black/20 text-xs sm:text-sm text-[color:var(--text-muted)]">
            Loading match center...
          </div>
        ) : visibleMatches.length ? (
            <div className="mt-4 grid gap-3">
              {visibleMatches.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  onDelete={handleDeleteMatch}
                  deleting={deletingMatchId === match.id}
                />
              ))}
          </div>
        ) : (
          <div className="mt-4 sm:mt-5 md:mt-6">
            <EmptyState
              icon={Swords}
              title={matches.length ? "No matches found for this filter" : "No fixtures have been generated yet"}
              description={
                matches.length
                  ? "Try another tournament or team filter."
                  : "This area will show real club matchups after Admins create tournaments and generate fixtures."
              }
            />
          </div>
        )}
      </Panel>
    </div>
  );
}

function normalizeMatchStatus(status: string | null | undefined): ClubMatch["status"] {
  if (status === "Live" || status === "Completed") return status;
  return "Upcoming";
}

function SelectField({
  label,
  value,
  onChange,
  options,
  allLabel
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  allLabel: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm text-[color:var(--text-muted)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-[#00D4FF]/30"
      >
        <option value="all">{allLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
