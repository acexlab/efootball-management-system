"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";
import { CalendarRange, ShieldCheck, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { IntraClanTournamentPanel } from "@/components/ui/intra-clan-tournament-panel";
import { MatchLineupManager } from "@/components/ui/match-lineup-manager";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusPill } from "@/components/ui/status-pill";
import { TeamManagementPanel } from "@/components/ui/team-management-panel";
import { TournamentTable } from "@/components/ui/tournament-table";
import { LeaderboardTable } from "@/components/ui/leaderboard-table";
import type { NewTournament } from "@/components/ui/create-tournament-modal";
import { useAuthProfile } from "@/hooks/use-auth-profile";
import { hasPermission } from "@/lib/rbac";
import { syncClubLeaderboardFromStats } from "@/lib/supabase/club-operations";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type { PlayerOption, Role, Tournament, TournamentFormatMode, TournamentScope } from "@/lib/types";

type ScopeView = "inter_clan" | "intra_clan";
type InterClanTab = "Overview" | "Teams" | "Matches";

export function TournamentsPage() {
  const { session, profile } = useAuthProfile();
  const canManage = hasPermission(profile.role, "manage:tournaments");
  const supabaseReady = hasSupabaseConfig();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { name: string; role: Role }>>({});
  const [loading, setLoading] = useState(supabaseReady);
  const [message, setMessage] = useState("");
  const [scopeView, setScopeView] = useState<ScopeView>("inter_clan");
  const [interClanTab, setInterClanTab] = useState<InterClanTab>("Overview");
  const [deletingTournamentId, setDeletingTournamentId] = useState<string | null>(null);
  const [updatingTournamentId, setUpdatingTournamentId] = useState<string | null>(null);
  const [manageableTournamentIds, setManageableTournamentIds] = useState<string[]>([]);
  const [selectedTournamentForViewId, setSelectedTournamentForViewId] = useState("");
  const [selectedTournamentLeaderboard, setSelectedTournamentLeaderboard] = useState<
    Array<{
      id: string;
      name: string;
      handle: string;
      team: string;
      image: string;
      matches: number;
      wins: number;
      draws: number;
      losses: number;
      goals: number;
      conceded: number;
      points: number;
      goalDifference: number;
      rank: number;
      position: string;
      rating: number;
      streak: string;
    }>
  >([]);

  const loadPage = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();

    if (!supabaseReady || !supabase || !session) {
      setTournaments([]);
      setProfiles({});
      setManageableTournamentIds([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const [
      { data: tournamentRows, error: tournamentsError },
      { data: profileRows, error: profilesError },
      { data: participantRows, error: participantsError }
    ] = await Promise.all([
      supabase
        .from("tournaments")
        .select(
          "id, name, external_competition, format, player_count, slot_count, status, lifecycle_state, home_team_name, captain_id, vice_captain_id, start_date, end_date"
        )
        .order("start_date", { ascending: true }),
      supabase.from("profiles").select("id, full_name, gamer_tag, role"),
      canManage
        ? Promise.resolve({ data: [] as Array<{ tournament_id: string }>, error: null })
        : supabase
            .from("tournament_participants")
            .select("tournament_id, role")
            .eq("user_id", profile.id ?? session.user.id)
            .in("role", ["captain", "vice_captain"])
    ]);

    if (tournamentsError || profilesError || participantsError) {
      setMessage(
        `Tournament tables are not ready yet. Run full-management-setup.sql. ${
          tournamentsError?.message ?? profilesError?.message ?? participantsError?.message ?? ""
        }`.trim()
      );
      setTournaments([]);
      setProfiles({});
      setManageableTournamentIds([]);
      setLoading(false);
      return;
    }

    const nextProfiles = Object.fromEntries(
      (profileRows ?? []).map((item) => [
        item.id,
        {
          name: item.gamer_tag || item.full_name || "Shield Member",
          role: (item.role as Role | null) ?? "Player"
        }
      ])
    );

    setProfiles(nextProfiles);

    setTournaments(
      (tournamentRows ?? []).map((item) => {
        const scope = deriveTournamentScope(item.external_competition);
        const formatMode = deriveTournamentFormatMode(scope, item.format);
        return {
          id: item.id,
          name: item.name,
          startDate: item.start_date,
          endDate: item.end_date,
          players: item.player_count,
          slotCount: item.slot_count ?? undefined,
          status: normalizeTournamentStatus(item.status),
          lifecycleState: (item.lifecycle_state as "active" | "completed" | null) ?? undefined,
          homeTeamName: item.home_team_name ?? undefined,
          format: item.format,
          captainId: item.captain_id ?? undefined,
          viceCaptainId: item.vice_captain_id ?? undefined,
          externalCompetition: item.external_competition,
          scope,
          formatMode,
          groupCount: deriveGroupCount(item.format)
        };
      })
    );

    if (canManage) {
      setManageableTournamentIds((tournamentRows ?? []).map((item) => item.id));
    } else {
      setManageableTournamentIds((participantRows ?? []).map((row) => row.tournament_id));
    }

    setMessage("");
    setLoading(false);
  }, [canManage, profile.id, session, supabaseReady]);

  const syncTournamentPage = useEffectEvent(() => {
    void loadPage();
  });

  useEffect(() => {
    syncTournamentPage();
  }, [canManage, profile.id, session, supabaseReady]);

  const loadTournamentLeaderboard = useCallback(async (tournamentId: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !tournamentId) {
      setSelectedTournamentLeaderboard([]);
      return;
    }

    const [{ data: participantRows, error: participantError }, { data: profileRows, error: profileError }, { data: matchRows, error: matchError }, { data: statRows, error: statError }] =
      await Promise.all([
        supabase.from("tournament_participants").select("user_id").eq("tournament_id", tournamentId),
        supabase.from("profiles").select("id, full_name, gamer_tag, club_name, avatar_url"),
        supabase.from("matches").select("id").eq("tournament_id", tournamentId),
        supabase.from("match_stats").select("match_id, player_id, goals, opponent_goals, result")
      ]);

    if (participantError || profileError || matchError || statError) {
      setSelectedTournamentLeaderboard([]);
      return;
    }

    const playerIds = new Set(((participantRows ?? []) as Array<{ user_id: string }>).map((row) => row.user_id));
    const matchIds = new Set(((matchRows ?? []) as Array<{ id: string }>).map((row) => row.id));
    const rows = ((profileRows ?? []) as Array<{ id: string; full_name: string | null; gamer_tag: string | null; club_name: string | null; avatar_url: string | null }>)
      .filter((row) => playerIds.has(row.id))
      .map((row) => ({
        id: row.id,
        name: row.full_name || row.gamer_tag || "Shield Member",
        handle: row.gamer_tag || row.full_name || "shield-member",
        team: row.club_name || "Shield Esports",
        image: row.avatar_url || "",
        matches: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals: 0,
        conceded: 0,
        points: 0,
        goalDifference: 0,
        rank: 0,
        position: "Shield Member",
        rating: 0,
        streak: ""
      }));

    const rowMap = new Map(rows.map((row) => [row.id, row]));

    for (const stat of (statRows ?? []) as Array<{ match_id: string; player_id: string; goals: number | null; opponent_goals: number | null; result: string | null }>) {
      if (!matchIds.has(stat.match_id)) continue;
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

    setSelectedTournamentLeaderboard(
      rows
        .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goals - a.goals || a.handle.localeCompare(b.handle))
        .map((row, index) => ({ ...row, rank: index + 1 }))
    );
  }, []);

  async function handleCreateTournament(form: NewTournament) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !session || !canManage) return;

    const startDate = form.startDate || new Date().toISOString().slice(0, 10);
    const endDate = form.endDate || startDate;
    const scopeLabel = form.scope === "intra_clan" ? "Intra Clan Tournament" : "Inter Clan Tournament";
    const normalizedFormat =
      form.scope === "intra_clan"
        ? form.formatMode === "group_knockout"
          ? `Group + Knockout • ${Math.max(form.groupCount, 2)} Pools`
          : form.formatMode === "knockout"
            ? "Knockout"
            : "League"
        : form.format;

    const { data: tournamentRow, error } = await supabase
      .from("tournaments")
      .insert({
        name: form.name,
        external_competition: scopeLabel,
        format: normalizedFormat,
        player_count: form.participantIds.length,
        slot_count: form.scope === "intra_clan" ? 2 : form.slotCount,
        home_team_name: form.teamName || "Shield Entity",
        status: "Ongoing",
        lifecycle_state: "active",
        captain_id: form.scope === "intra_clan" ? null : form.captainId,
        vice_captain_id: form.scope === "intra_clan" ? null : form.viceCaptainId,
        created_by: profile.id ?? session.user.id,
        start_date: startDate,
        end_date: endDate
      })
      .select("id")
      .single();

    if (error) {
      setMessage(`Tournament could not be created: ${error.message}`);
      return;
    }

    const participantRows = form.participantIds.map((userId) => ({
      tournament_id: tournamentRow.id,
      user_id: userId,
      role:
        userId === form.captainId
          ? "captain"
          : userId === form.viceCaptainId
            ? "vice_captain"
            : "player"
    }));

    const { error: participantsError } = await supabase.from("tournament_participants").insert(participantRows);
    if (participantsError) {
      await supabase.from("tournaments").delete().eq("id", tournamentRow.id);
      setMessage(`Tournament could not be created because squad assignment failed: ${participantsError.message}`);
      return;
    }

    if (form.scope === "intra_clan") {
      const intraMessage = await createIntraClanStructure({
        supabase,
        tournamentId: tournamentRow.id,
        form,
        profiles
      });

      if (intraMessage.error) {
        await supabase.from("tournaments").delete().eq("id", tournamentRow.id);
        setMessage(intraMessage.error);
        return;
      }

      setMessage(intraMessage.message ?? "Intra clan tournament created successfully.");
      await loadPage();
      return;
    }

    const { data: teamRow, error: teamError } = await supabase
      .from("tournament_teams")
      .insert({
        tournament_id: tournamentRow.id,
        name: `${form.name} Squad`,
        players_per_team: form.slotCount,
        subs_per_team: form.subCount
      })
      .select("id")
      .single();

    if (teamError || !teamRow) {
      await supabase.from("tournaments").delete().eq("id", tournamentRow.id);
      setMessage(`Tournament could not be created because team setup failed: ${teamError?.message ?? "Team row was not created."}`);
      return;
    }

    const teamPlayerRows = form.participantIds.map((userId) => ({
      team_id: teamRow.id,
      player_id: userId
    }));

    const { error: teamPlayersError } = await supabase.from("team_players").insert(teamPlayerRows);
    if (teamPlayersError) {
      await supabase.from("tournaments").delete().eq("id", tournamentRow.id);
      setMessage(`Tournament could not be created because team players failed: ${teamPlayersError.message}`);
      return;
    }

    setMessage("Inter clan tournament created successfully.");
    await loadPage();
  }

  async function handleDeleteTournament(tournament: Tournament) {
    if (!canManage) return;

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`Delete tournament "${tournament.name}" and all its matches/results?`);
      if (!confirmed) return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setDeletingTournamentId(tournament.id);
    setMessage("");

    const { error: rpcError } = await supabase.rpc("delete_tournament_force", {
      target_tournament_id: tournament.id
    });

    if (rpcError) {
      const fallbackReopen = await supabase
        .from("tournaments")
        .update({
          lifecycle_state: "active",
          status: "Ongoing",
          completed_at: null
        })
        .eq("id", tournament.id);

      if (fallbackReopen.error) {
        setMessage(`Tournament could not be reopened for deletion: ${fallbackReopen.error.message}`);
        setDeletingTournamentId(null);
        return;
      }

      const { error } = await supabase.from("tournaments").delete().eq("id", tournament.id);
      if (error) {
        setMessage(`Tournament could not be deleted: ${error.message}`);
        setDeletingTournamentId(null);
        return;
      }
    }

    try {
      await syncClubLeaderboardFromStats(supabase);
    } catch (leaderboardError) {
      const detail = leaderboardError instanceof Error ? leaderboardError.message : "Unknown error";
      setMessage(`Tournament deleted, but leaderboard sync failed: ${detail}`);
      setDeletingTournamentId(null);
      await loadPage();
      return;
    }

    setMessage("Tournament deleted successfully.");
    setDeletingTournamentId(null);
    await loadPage();
  }

  async function handleToggleTournamentLifecycle(tournament: Tournament) {
    if (!canManage) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const nextState = tournament.lifecycleState === "completed" ? "active" : "completed";
    const nextStatus = nextState === "completed" ? "Completed" : "Ongoing";

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        nextState === "completed"
          ? `Mark "${tournament.name}" as completed? This will hide it from active match entry.`
          : `Reopen "${tournament.name}" and make it active again?`
      );
      if (!confirmed) return;
    }

    setUpdatingTournamentId(tournament.id);
    setMessage("");

    const { error } = await supabase
      .from("tournaments")
      .update({
        lifecycle_state: nextState,
        status: nextStatus,
        completed_at: nextState === "completed" ? new Date().toISOString() : null
      })
      .eq("id", tournament.id);

    if (error) {
      setMessage(`Tournament could not be updated: ${error.message}`);
      setUpdatingTournamentId(null);
      return;
    }

    setMessage(nextState === "completed" ? "Tournament marked as completed." : "Tournament reopened and active.");
    setUpdatingTournamentId(null);
    await loadPage();
  }

  const captainNames = useMemo(
    () => Object.fromEntries(Object.entries(profiles).map(([id, item]) => [id, item.name])),
    [profiles]
  );

  const playerOptions = useMemo<PlayerOption[]>(
    () =>
      Object.entries(profiles).map(([id, item]) => ({
        id,
        name: item.name,
        role: item.role
      })),
    [profiles]
  );

  const interClanTournaments = tournaments.filter((item) => item.scope !== "intra_clan");
  const intraClanTournaments = tournaments.filter((item) => item.scope === "intra_clan");
  const selectedTournamentForView =
    tournaments.find((item) => item.id === selectedTournamentForViewId) ??
    interClanTournaments[0] ??
    intraClanTournaments[0] ??
    null;
  const interClanIds = new Set(interClanTournaments.map((item) => item.id));
  const interClanManageableIds = manageableTournamentIds.filter((item) => interClanIds.has(item));
  const captainsAssigned = interClanTournaments.filter((item) => item.captainId).length;

  useEffect(() => {
    if (!selectedTournamentForView?.id) {
      setSelectedTournamentLeaderboard([]);
      return;
    }
    void loadTournamentLeaderboard(selectedTournamentForView.id);
  }, [loadTournamentLeaderboard, selectedTournamentForView?.id]);

  return (
    <div className="space-y-4">
      <Panel className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <SectionHeading
            eyebrow="Competition ops"
            title={scopeView === "inter_clan" ? "Inter Clan Tournaments" : "Intra Clan Tournaments"}
            description={
              scopeView === "inter_clan"
                ? "Manage external competition squads, captain assignments, team building, and match-day selections."
                : "Create clan-only tournaments, split players into pools, review fixtures, update results, and watch live pool tables."
            }
          />
          <div className="flex flex-wrap gap-2">
            <StatusPill label={canManage ? "Management Enabled" : "View Only"} tone={canManage ? "success" : "warning"} />
            <StatusPill label={`${interClanTournaments.length} inter clan`} tone="info" />
            <StatusPill label={`${intraClanTournaments.length} intra clan`} tone="neutral" />
          </div>
        </div>

        {message ? (
          <div className="mt-4 rounded-xl border border-[#7A5CFF]/25 bg-[#7A5CFF]/10 px-3 py-2 text-sm text-[#E3DAFF]">
            {message}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setScopeView("inter_clan")}
            className={`rounded-full border px-3 py-2 text-xs font-semibold sm:text-sm ${
              scopeView === "inter_clan"
                ? "border-[#00FF88]/30 bg-[#00FF88]/10 text-[#00FF88]"
                : "border-white/10 bg-white/[0.03] text-[color:var(--text-muted)]"
            }`}
          >
            Inter Clan Tournaments
          </button>
          <button
            type="button"
            onClick={() => setScopeView("intra_clan")}
            className={`rounded-full border px-3 py-2 text-xs font-semibold sm:text-sm ${
              scopeView === "intra_clan"
                ? "border-[#00FF88]/30 bg-[#00FF88]/10 text-[#00FF88]"
                : "border-white/10 bg-white/[0.03] text-[color:var(--text-muted)]"
            }`}
          >
            Intra Clan Tournaments
          </button>
        </div>
      </Panel>

      {scopeView === "inter_clan" ? (
        <>
          <Panel className="p-4 sm:p-5">
            <div className="flex flex-wrap gap-2">
              {(["Overview", "Teams", "Matches"] as const).map((item) => (
                <button
                  key={item}
                  onClick={() => setInterClanTab(item)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    interClanTab === item
                      ? "border-[#00FF88]/30 bg-[#00FF88]/10 text-[#00FF88]"
                      : "border-white/10 bg-white/[0.03] text-[color:var(--text-muted)]"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="mt-4">
              <TournamentTable
                items={interClanTournaments}
                captainNames={captainNames}
                canManage={canManage}
                loading={loading}
                onCreate={handleCreateTournament}
                createDisabled={!supabaseReady || !session}
                playerOptions={playerOptions}
                onDelete={handleDeleteTournament}
                deletingTournamentId={deletingTournamentId}
                onToggleLifecycle={handleToggleTournamentLifecycle}
                updatingTournamentId={updatingTournamentId}
                createLabel="Create Inter Clan Tournament"
                defaultScope="inter_clan"
                onView={(tournament) => setSelectedTournamentForViewId(tournament.id)}
              />
            </div>
          </Panel>

          {interClanTab === "Overview" ? (
            <>
              <div className="grid gap-4 2xl:grid-cols-[1.2fr_0.8fr]">
                <Panel className="p-4 sm:p-5">
                  <SectionHeading
                    eyebrow="Inter Clan"
                    title="Tournament Overview"
                    description="Squad, captaincy, matches count, and status at a glance."
                  />
                  {interClanTournaments.length ? (
                    <div className="mt-6 space-y-4">
                      {interClanTournaments.map((tournament) => (
                        <div key={tournament.id} className="rounded-xl border border-white/8 bg-black/20 p-3">
                          <p className="font-semibold text-white">{tournament.name}</p>
                          <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                            {tournament.externalCompetition || "Inter Clan Tournament"} • Status: {tournament.status}
                          </p>
                          <div className="mt-3 grid gap-2 lg:grid-cols-2">
                            <RoleAssignment
                              label="Captain"
                              name={tournament.captainId ? captainNames[tournament.captainId] ?? "Unassigned" : "Unassigned"}
                            />
                            <RoleAssignment
                              label="Vice-Captain"
                              name={
                                tournament.viceCaptainId ? captainNames[tournament.viceCaptainId] ?? "Unassigned" : "Unassigned"
                              }
                            />
                            <RoleAssignment label="Matches" name={`${tournament.players} squad • ${tournament.slotCount ?? 0} slots`} />
                            <RoleAssignment label="Status" name={tournament.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-6">
                      <EmptyState
                        icon={ShieldCheck}
                        title="Assignments will appear after tournament creation"
                        description="Once inter clan tournaments exist, captain and vice-captain assignments will be shown here with real members from the player directory."
                      />
                    </div>
                  )}
                </Panel>

                <Panel className="p-4 sm:p-5">
                  <SectionHeading
                    eyebrow="Current View"
                    title="Inter Clan Summary"
                    description="Use Teams and Matches to keep the squad builder and match-day lineup flow compact on mobile too."
                  />
                  <div className="mt-4 rounded-xl border border-white/8 bg-black/20 p-3 text-sm text-[color:var(--text-muted)]">
                    Inter clan tournaments keep the current external competition flow, with improved compact layouts and internal scrolling for large player lists.
                  </div>
                </Panel>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <SummaryCard
                  icon={CalendarRange}
                  label="Total tournaments"
                  value={interClanTournaments.length}
                  help="Live inter clan competitions registered in the club system."
                />
                <SummaryCard
                  icon={Users}
                  label="Captains assigned"
                  value={captainsAssigned}
                  help="Inter clan competitions with a named tournament captain."
                />
                <SummaryCard
                  icon={ShieldCheck}
                  label="Open setup"
                  value={Math.max(interClanTournaments.length - captainsAssigned, 0)}
                  help="Inter clan tournaments still missing assignment work."
                />
              </div>
            </>
          ) : null}

          {interClanTab === "Teams" ? (
            <TeamManagementPanel
              canManageAll={canManage}
              canBuildTeams={canManage || interClanManageableIds.length > 0}
              manageableTournamentIds={interClanManageableIds}
              defaultTournamentId={interClanTournaments[0]?.id}
            />
          ) : null}

          {interClanTab === "Matches" ? (
            <MatchLineupManager canManageAll={canManage} manageableTournamentIds={interClanManageableIds} />
          ) : null}

          {selectedTournamentForView ? (
            <Panel className="p-4 sm:p-5">
              <SectionHeading
                eyebrow="Tournament View"
                title={`${selectedTournamentForView.name} Player Form`}
                description="Leaderboard-style player performance for this specific tournament only."
              />
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusPill label={selectedTournamentForView.scope === "intra_clan" ? "Intra Clan" : "Inter Clan"} tone="info" />
                <StatusPill label={selectedTournamentForView.format} tone="neutral" />
                <StatusPill label={`${selectedTournamentLeaderboard.length} players`} tone="success" />
              </div>
              <div className="mt-4">
                <LeaderboardTable
                  rows={selectedTournamentLeaderboard}
                  emptyMessage="No player stats recorded for this tournament yet."
                />
              </div>
            </Panel>
          ) : null}
        </>
      ) : (
        <IntraClanTournamentPanel
          tournaments={intraClanTournaments}
          playerOptions={playerOptions}
          canManageAll={canManage}
          manageableTournamentIds={manageableTournamentIds}
          onCreate={handleCreateTournament}
          onDelete={handleDeleteTournament}
          deletingTournamentId={deletingTournamentId}
        />
      )}
    </div>
  );
}

async function createIntraClanStructure({
  supabase,
  tournamentId,
  form,
  profiles
}: {
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;
  tournamentId: string;
  form: NewTournament;
  profiles: Record<string, { name: string; role: Role }>;
}) {
  const poolCount = form.formatMode === "group_knockout" ? Math.max(form.groupCount, 2) : 1;
  const pools = splitPlayersIntoPools(form.participantIds, poolCount);
  const poolRows = pools.map((playerIds, index) => ({
    tournament_id: tournamentId,
    name: form.formatMode === "knockout" ? "Knockout Bracket" : poolCount === 1 ? "League Stage" : `Pool ${String.fromCharCode(65 + index)}`,
    players_per_team: 1,
    subs_per_team: 0
  }));

  const { data: teamRows, error: teamError } = await supabase
    .from("tournament_teams")
    .insert(poolRows)
    .select("id, name");

  if (teamError || !teamRows) {
    return {
      error: `Tournament could not be created because pool setup failed: ${teamError?.message ?? "Pool rows were not created."}`
    };
  }

  const teamPlayerRows = teamRows.flatMap((team, index) =>
    pools[index].map((playerId) => ({
      team_id: team.id,
      player_id: playerId
    }))
  );

  const { error: teamPlayersError } = await supabase.from("team_players").insert(teamPlayerRows);
  if (teamPlayersError) {
    return {
      error: `Tournament could not be created because pool player assignment failed: ${teamPlayersError.message}`
    };
  }

  const fixtures =
    form.formatMode === "knockout"
      ? generateKnockoutPairs(form.participantIds).map(([homePlayerId, awayPlayerId], fixtureIndex) => ({
          tournament_id: tournamentId,
          match_number: fixtureIndex + 1,
          home_player_id: homePlayerId,
          away_player_id: awayPlayerId,
          opponent_team: profiles[awayPlayerId]?.name ?? "Player",
          scheduled_at: null,
          venue: "Knockout Bracket",
          status: "Upcoming",
          lineup_locked: false
        }))
      : teamRows.flatMap((team, index) =>
          generateRoundRobinPairs(pools[index]).map(([homePlayerId, awayPlayerId], fixtureIndex) => ({
            tournament_id: tournamentId,
            match_number: index * 100 + fixtureIndex + 1,
            home_player_id: homePlayerId,
            away_player_id: awayPlayerId,
            opponent_team: profiles[awayPlayerId]?.name ?? "Player",
            scheduled_at: null,
            venue: team.name,
            status: "Upcoming",
            lineup_locked: false
          }))
        );

  if (fixtures.length) {
    const { error: fixtureError } = await supabase.from("matches").insert(fixtures);
    if (fixtureError) {
      return {
        error: `Tournament was created, but fixtures could not be generated: ${fixtureError.message}`
      };
    }
  }

  return {
    message:
      form.formatMode === "group_knockout"
        ? "Intra clan tournament created. Pool fixtures are generated and knockout previews will update from the live pool tables."
        : form.formatMode === "knockout"
          ? "Intra clan knockout tournament created. Opening bracket fixtures are ready."
          : "Intra clan league created. Round-robin fixtures are ready."
  };
}

function splitPlayersIntoPools(playerIds: string[], poolCount: number) {
  const pools = Array.from({ length: poolCount }, () => [] as string[]);

  playerIds.forEach((playerId, index) => {
    pools[index % poolCount].push(playerId);
  });

  return pools;
}

function generateRoundRobinPairs(playerIds: string[]) {
  const pairs: Array<[string, string]> = [];

  for (let i = 0; i < playerIds.length; i += 1) {
    for (let j = i + 1; j < playerIds.length; j += 1) {
      pairs.push([playerIds[i], playerIds[j]]);
    }
  }

  return pairs;
}

function generateKnockoutPairs(playerIds: string[]) {
  const pairs: Array<[string, string]> = [];

  for (let i = 0; i < playerIds.length; i += 2) {
    const homePlayerId = playerIds[i];
    const awayPlayerId = playerIds[i + 1];

    if (homePlayerId && awayPlayerId) {
      pairs.push([homePlayerId, awayPlayerId]);
    }
  }

  return pairs;
}

function deriveTournamentScope(externalCompetition: string | null | undefined): TournamentScope {
  return externalCompetition?.toLowerCase().includes("intra clan") ? "intra_clan" : "inter_clan";
}

function deriveTournamentFormatMode(scope: TournamentScope, format: string | null | undefined): TournamentFormatMode {
  if (scope !== "intra_clan") return "league";
  if (format?.toLowerCase().includes("group + knockout")) return "group_knockout";
  if (format?.toLowerCase().includes("knockout")) return "knockout";
  return "league";
}

function deriveGroupCount(format: string | null | undefined) {
  const match = format?.match(/(\d+)\s+Pools?/i);
  return match ? Number(match[1]) : 1;
}

function normalizeTournamentStatus(status: string | null | undefined): Tournament["status"] {
  if (status === "Ongoing" || status === "Completed") return status;
  return "Upcoming";
}

function RoleAssignment({ label, name }: { label: string; name: string }) {
  return (
    <div className="rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-4">
      <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--text-muted)]">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{name}</p>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  help
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  help: string;
}) {
  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--text-muted)]">{label}</p>
          <p className="mt-3 text-3xl font-black text-white">{value}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <Icon className="h-5 w-5 text-[#00D4FF]" />
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-[color:var(--text-muted)]">{help}</p>
    </Panel>
  );
}
