"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";
import { CalendarRange, ShieldCheck, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { MatchLineupManager } from "@/components/ui/match-lineup-manager";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusPill } from "@/components/ui/status-pill";
import { TournamentTable } from "@/components/ui/tournament-table";
import type { NewTournament } from "@/components/ui/create-tournament-modal";
import { useAuthProfile } from "@/hooks/use-auth-profile";
import { hasPermission } from "@/lib/rbac";
import { syncClubLeaderboardFromStats } from "@/lib/supabase/club-operations";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type { PlayerOption, Role, Tournament } from "@/lib/types";

export function TournamentsPage() {
  const { session, profile } = useAuthProfile();
  const canManage = hasPermission(profile.role, "manage:tournaments");
  const supabaseReady = hasSupabaseConfig();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { name: string; role: Role }>>({});
  const [loading, setLoading] = useState(supabaseReady);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"Overview" | "Matches" | "Leaderboard" | "Players">("Overview");
  const [deletingTournamentId, setDeletingTournamentId] = useState<string | null>(null);

  const loadPage = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();

    if (!supabaseReady || !supabase || !session) {
      setTournaments([]);
      setProfiles({});
      setLoading(false);
      return;
    }

    setLoading(true);

    const [{ data: tournamentRows, error: tournamentsError }, { data: profileRows, error: profilesError }] =
      await Promise.all([
        supabase
          .from("tournaments")
          .select(
            "id, name, external_competition, format, player_count, slot_count, status, captain_id, vice_captain_id, start_date, end_date"
          )
          .order("start_date", { ascending: true }),
        supabase.from("profiles").select("id, full_name, gamer_tag, role")
      ]);

    if (tournamentsError || profilesError) {
      setMessage(
        `Tournament tables are not ready yet. Run full-management-setup.sql. ${
          tournamentsError?.message ?? profilesError?.message ?? ""
        }`.trim()
      );
      setTournaments([]);
      setProfiles({});
      setLoading(false);
      return;
    }

    setProfiles(
      Object.fromEntries(
        (profileRows ?? []).map((item) => [
          item.id,
          {
            name: item.gamer_tag || item.full_name || "Shield Member",
            role: (item.role as Role | null) ?? "Player"
          }
        ])
      )
    );

    setTournaments(
      (tournamentRows ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        startDate: item.start_date,
        endDate: item.end_date,
        players: item.player_count,
        slotCount: item.slot_count ?? undefined,
        status: normalizeTournamentStatus(item.status),
        format: item.format,
        captainId: item.captain_id ?? undefined,
        viceCaptainId: item.vice_captain_id ?? undefined,
        externalCompetition: item.external_competition
      }))
    );
    setMessage("");
    setLoading(false);
  }, [session, supabaseReady]);

  const syncTournamentPage = useEffectEvent(() => {
    void loadPage();
  });

  useEffect(() => {
    syncTournamentPage();
  }, [session, supabaseReady]);

  async function handleCreateTournament(form: NewTournament) {
    const supabase = getSupabaseBrowserClient();

    if (!supabase || !session || !canManage) return;

    const startDate = form.startDate || new Date().toISOString().slice(0, 10);
    const endDate = form.endDate || startDate;

    const { data: tournamentRow, error } = await supabase
      .from("tournaments")
      .insert({
        name: form.name,
        external_competition: "Shield Esports Tournament",
        format: form.format,
        player_count: form.participantIds.length,
        slot_count: form.slotCount,
        status: "Ongoing",
        lifecycle_state: "active",
        captain_id: form.captainId,
        vice_captain_id: form.viceCaptainId,
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
      const missingTeamTable =
        teamError?.message.includes("Could not find the table 'public.tournament_teams'") ||
        teamError?.message.includes("relation \"public.tournament_teams\" does not exist");

      if (missingTeamTable) {
        setMessage(
          "Tournament created successfully. Match-day main/sub lineup options will unlock after you run the latest full-management-setup.sql."
        );
        await loadPage();
        return;
      }

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
      const missingTeamPlayersTable =
        teamPlayersError.message.includes("Could not find the table 'public.team_players'") ||
        teamPlayersError.message.includes("relation \"public.team_players\" does not exist");

      if (missingTeamPlayersTable) {
        setMessage(
          "Tournament created successfully. Match-day main/sub lineup options will unlock after you run the latest full-management-setup.sql."
        );
        await loadPage();
        return;
      }

      await supabase.from("tournaments").delete().eq("id", tournamentRow.id);
      setMessage(`Tournament could not be created because team players failed: ${teamPlayersError.message}`);
      return;
    }

    setMessage("Tournament created successfully.");
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

    const { error } = await supabase.from("tournaments").delete().eq("id", tournament.id);

    if (error) {
      setMessage(`Tournament could not be deleted: ${error.message}`);
      setDeletingTournamentId(null);
      return;
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
  const captainsAssigned = tournaments.filter((item) => item.captainId).length;

  return (
    <div className="space-y-4">
      <Panel className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <SectionHeading
            eyebrow="Competition ops"
            title="Tournaments"
            description="Admins create internal club tournaments, assign captain and vice-captain, select the squad, and manage fixtures."
          />
          <StatusPill label={canManage ? "Management Enabled" : "View Only"} tone={canManage ? "success" : "warning"} />
        </div>
        {message ? (
          <div className="mt-4 rounded-xl border border-[#7A5CFF]/25 bg-[#7A5CFF]/10 px-3 py-2 text-sm text-[#E3DAFF]">
            {message}
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {(["Overview", "Matches", "Leaderboard", "Players"] as const).map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                tab === item
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
            items={tournaments}
            captainNames={captainNames}
            canManage={canManage}
            loading={loading}
            onCreate={handleCreateTournament}
            createDisabled={!supabaseReady || !session}
            playerOptions={playerOptions}
            onDelete={handleDeleteTournament}
            deletingTournamentId={deletingTournamentId}
          />
        </div>
      </Panel>

      <div className="grid gap-4 2xl:grid-cols-[1.2fr_0.8fr]">
        <Panel className="p-4 sm:p-5">
          <SectionHeading
            eyebrow={tab}
            title="Tournament Overview"
            description="Squad, captaincy, matches count, and status at a glance."
          />
          {tournaments.length ? (
            <div className="mt-6 space-y-4">
              {tournaments.map((tournament) => (
                <div key={tournament.id} className="rounded-xl border border-white/8 bg-black/20 p-3">
                  <p className="font-semibold text-white">{tournament.name}</p>
                  <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                    {tournament.externalCompetition || "External competition not set"} • Status: {tournament.status}
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
                description="Once tournaments exist, captain and vice-captain assignments will be shown here with real members from the player directory."
              />
            </div>
          )}
        </Panel>

        <Panel className="p-4 sm:p-5">
          <SectionHeading
            eyebrow="Focus"
            title="Current Tab Summary"
            description="Switch tabs to focus on tournament overview, matches, leaderboard, or players."
          />
          <div className="mt-4 rounded-xl border border-white/8 bg-black/20 p-3 text-sm text-[color:var(--text-muted)]">
            {tab === "Overview" && "Overview focuses on squad, captain, match count, and status."}
            {tab === "Matches" && "Use Matches page to review fixtures and enter results quickly."}
            {tab === "Leaderboard" && "Use Leaderboard page for ranked performance and sorting."}
            {tab === "Players" && "Use Players page for member stats and roster performance."}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SummaryCard
          icon={CalendarRange}
          label="Total tournaments"
          value={tournaments.length}
          help="Live competitions registered in the club system."
        />
        <SummaryCard
          icon={Users}
          label="Captains assigned"
          value={captainsAssigned}
          help="Competitions with a named tournament captain."
        />
        <SummaryCard
          icon={ShieldCheck}
          label="Open setup"
          value={Math.max(tournaments.length - captainsAssigned, 0)}
          help="Tournaments still missing assignment work."
        />
      </div>

      <MatchLineupManager canManage={canManage} />
    </div>
  );
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
