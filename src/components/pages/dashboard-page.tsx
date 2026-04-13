"use client";

import Link from "next/link";
import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { CalendarClock, LogOut, Plus, RefreshCcw, Swords, Trophy, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { LeaderboardTable } from "@/components/ui/leaderboard-table";
import { MatchCard } from "@/components/ui/match-card";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusPill } from "@/components/ui/status-pill";
import { useAuthProfile } from "@/hooks/use-auth-profile";
import { hasPermission } from "@/lib/rbac";
import { emptyClubLeaderboard, mapClubLeaderboardRows } from "@/lib/supabase/club-leaderboard";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type { ClubMatch, LeaderboardRow } from "@/lib/types";

type TournamentSummary = {
  id: string;
  name: string;
  status: string;
  matchCount: number;
};

export function DashboardPage() {
  const supabaseReady = hasSupabaseConfig();
  const { session, profile, loading: authLoading } = useAuthProfile();
  const signedIn = Boolean(session);

  const [rows, setRows] = useState<LeaderboardRow[]>(emptyClubLeaderboard);
  const [recentMatches, setRecentMatches] = useState<ClubMatch[]>([]);
  const [activeTournament, setActiveTournament] = useState<TournamentSummary | null>(null);
  const [rowsLoading, setRowsLoading] = useState(supabaseReady);
  const [statusMessage, setStatusMessage] = useState("");
  const [dbMessage, setDbMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canManageTournaments = hasPermission(profile.role, "manage:tournaments");
  const canEnterResults = hasPermission(profile.role, "enter:results");
  const canManageUsers = hasPermission(profile.role, "manage:users");

  const loadDashboardData = useCallback(
    async (activeSession: Session | null) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase || !activeSession) {
        setRows(emptyClubLeaderboard);
        setRecentMatches([]);
        setActiveTournament(null);
        setRowsLoading(false);
        return;
      }

      setRowsLoading(true);
      setDbMessage("");

      const [leaderboardResult, tournamentsResult, matchesResult, profilesResult] = await Promise.all([
        supabase
          .from("club_leaderboard")
          .select(
            "id, player_id, player_name, player_handle, club_name, image_url, matches, wins, draws, losses, goals_scored, goals_conceded, goal_difference, points"
          )
          .eq("club_name", profile.club)
          .order("points", { ascending: false })
          .order("goals_scored", { ascending: false })
          .order("wins", { ascending: false }),
        supabase
          .from("tournaments")
          .select("id, name, status")
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("matches")
          .select("id, home_player_id, away_player_id, home_score, away_score, scheduled_at, venue, status, tournament_id, match_number")
          .order("scheduled_at", { ascending: false })
          .limit(5),
        supabase.from("profiles").select("id, full_name, gamer_tag")
      ]);

      if (leaderboardResult.error) {
        setRows(emptyClubLeaderboard);
        setDbMessage(`Leaderboard unavailable: ${leaderboardResult.error.message}`);
      } else {
        setRows(mapClubLeaderboardRows(leaderboardResult.data ?? []));
      }

      if (tournamentsResult.error) {
        setActiveTournament(null);
      } else {
        const tournament = tournamentsResult.data?.[0];
        if (tournament) {
          const { count } = await supabase
            .from("matches")
            .select("id", { count: "exact", head: true })
            .eq("tournament_id", tournament.id);

          setActiveTournament({
            id: tournament.id,
            name: tournament.name,
            status: tournament.status ?? "Upcoming",
            matchCount: count ?? 0
          });
        } else {
          setActiveTournament(null);
        }
      }

      const profileMap = Object.fromEntries(
        (profilesResult.data ?? []).map((item) => [item.id, item.gamer_tag || item.full_name || "Player"])
      );
      const tournamentMap = Object.fromEntries(
        ((tournamentsResult.data as Array<{ id: string; name: string }> | null) ?? []).map((item) => [
          item.id,
          item.name
        ])
      );

      if (!matchesResult.error) {
        setRecentMatches(
          (matchesResult.data ?? []).map((match) => ({
            id: match.id,
            matchNumber: match.match_number ?? undefined,
            home: profileMap[match.home_player_id] ?? "Home Player",
            away: profileMap[match.away_player_id] ?? "Away Player",
            homeScore: match.home_score ?? 0,
            awayScore: match.away_score ?? 0,
            date: match.scheduled_at ? new Date(match.scheduled_at).toLocaleString() : "Not scheduled",
            status: normalizeMatchStatus(match.status),
            venue: match.venue || "Club Arena",
            tournament: tournamentMap[match.tournament_id] ?? "Tournament",
            slots: [profileMap[match.home_player_id] ?? "Slot 1", profileMap[match.away_player_id] ?? "Slot 2"]
          }))
        );
      } else {
        setRecentMatches([]);
      }

      setRowsLoading(false);
    },
    [profile.club]
  );

  const syncDashboard = useEffectEvent((activeSession: Session) => {
    void loadDashboardData(activeSession);
  });

  useEffect(() => {
    if (!session) return;
    syncDashboard(session);
  }, [session]);

  async function handleGoogleSignIn() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStatusMessage("Login setup is missing. Check your public project URL and key.");
      return;
    }

    setSubmitting(true);
    setStatusMessage("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: typeof window !== "undefined" ? `${window.location.origin}/` : undefined }
    });

    if (error) {
      setStatusMessage(error.message);
      setSubmitting(false);
      return;
    }

    setStatusMessage("Redirecting to Google sign-in...");
  }

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    setStatusMessage("Signed out.");
  }

  const topPlayers = useMemo(() => rows.slice(0, 5), [rows]);
  const nextMatch = useMemo(
    () => recentMatches.find((match) => match.status === "Upcoming") ?? recentMatches[0] ?? null,
    [recentMatches]
  );

  return (
    <div className="space-y-4">
      <Panel className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading
            eyebrow={profile.club}
            title="Dashboard"
            description="Action-first control center for tournaments, matches, and leaderboard."
          />
          <div className="flex flex-wrap gap-2">
            <StatusPill
              label={signedIn ? profile.role : authLoading ? "Checking Auth" : "Guest"}
              tone={signedIn ? "success" : "info"}
            />
            <StatusPill label={supabaseReady ? "Connected" : "Setup Needed"} tone={supabaseReady ? "success" : "warning"} />
          </div>
        </div>
      </Panel>

      <div className="grid gap-3 md:grid-cols-3">
        <Panel className="p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--text-muted)]">Active Tournament</p>
            <Trophy className="h-4 w-4 text-[#00FF88]" />
          </div>
          <p className="mt-2 text-lg font-semibold text-white">{activeTournament?.name ?? "No active tournament"}</p>
          <p className="mt-1 text-sm text-[color:var(--text-muted)]">
            {activeTournament ? `${activeTournament.matchCount} matches • ${activeTournament.status}` : "Create one to start fixtures."}
          </p>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--text-muted)]">Next Match</p>
            <CalendarClock className="h-4 w-4 text-[#00D4FF]" />
          </div>
          <p className="mt-2 text-lg font-semibold text-white">
            {nextMatch ? `${nextMatch.home} vs ${nextMatch.away}` : "No scheduled matches"}
          </p>
          <p className="mt-1 text-sm text-[color:var(--text-muted)]">{nextMatch?.date ?? "Schedule a match to continue."}</p>
        </Panel>

        <Panel className="p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--text-muted)]">Quick Actions</p>
          <div className="mt-3 grid gap-2">
            <ActionButton href="/tournaments" icon={Plus} label="Create Tournament" enabled={canManageTournaments} />
            <ActionButton href="/results" icon={Swords} label="Enter Result" enabled={canEnterResults} />
            <ActionButton href="/players" icon={Users} label="Select Lineup" enabled={canManageUsers || canManageTournaments} />
          </div>
        </Panel>
      </div>

      {signedIn ? (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void loadDashboardData(session)}
            className="inline-flex items-center gap-2 rounded-lg border border-[#00D4FF]/25 bg-[#00D4FF]/10 px-3 py-2 text-xs font-semibold text-[#8BE8FF]"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh Data
          </button>
          <button
            onClick={() => void handleSignOut()}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void handleGoogleSignIn()}
          disabled={submitting || !supabaseReady}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#00FF88]/25 bg-[#00FF88]/12 px-4 py-2 text-sm font-semibold text-[#00FF88] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Redirecting..." : "Continue with Google"}
        </button>
      )}

      {statusMessage ? (
        <div className="rounded-lg border border-[#00D4FF]/20 bg-[#00D4FF]/10 px-3 py-2 text-xs text-[#C5F5FF]">
          {statusMessage}
        </div>
      ) : null}

      {dbMessage ? (
        <div className="rounded-lg border border-[#7A5CFF]/25 bg-[#7A5CFF]/10 px-3 py-2 text-xs text-[#E3DAFF]">
          {dbMessage}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-4">
          <SectionHeading
            eyebrow="Recent Matches"
            title="Latest Match Results"
            description="Most recent fixtures and their current status."
          />
          {recentMatches.length ? (
            <div className="mt-4 space-y-3">
              {recentMatches.slice(0, 3).map((match) => (
                <MatchCard key={match.id} match={match} />
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState
                icon={Swords}
                title="No recent matches"
                description="Create fixtures and submit results to populate this section."
              />
            </div>
          )}
        </Panel>

        <Panel className="p-4">
          <SectionHeading
            eyebrow="Top Players"
            title="Leaderboard Preview"
            description="Current top performers ranked by points, goals, and wins."
          />
          <div className="mt-4">
            {rowsLoading && signedIn ? (
              <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-white/8 bg-black/20 text-sm text-[color:var(--text-muted)]">
                Loading leaderboard...
              </div>
            ) : (
              <LeaderboardTable rows={topPlayers} compact />
            )}
          </div>
          <div className="mt-3">
            <Link href="/leaderboard" className="text-xs font-semibold text-[#00D4FF]">
              View full leaderboard
            </Link>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function normalizeMatchStatus(status: string | null | undefined): ClubMatch["status"] {
  if (status === "Live" || status === "Completed") return status;
  return "Upcoming";
}

function ActionButton({
  href,
  icon: Icon,
  label,
  enabled
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  enabled: boolean;
}) {
  const style = enabled
    ? "border-[#00FF88]/30 bg-[#00FF88]/10 text-[#00FF88]"
    : "border-white/10 bg-white/[0.03] text-[color:var(--text-muted)] pointer-events-none";

  return (
    <Link href={href} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${style}`}>
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
