"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";
import { FilePenLine, ShieldPlus, Trash2, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusPill } from "@/components/ui/status-pill";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useAuthProfile } from "@/hooks/use-auth-profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type TournamentOption = {
  id: string;
  name: string;
  slotCount: number;
};

type PlayerPerformance = {
  id: string;
  name: string;
  avatarUrl?: string;
  matches: number;
  points: number;
  goals: number;
  wins: number;
  draws: number;
  losses: number;
};

type TeamCard = {
  id: string;
  name: string;
  logoUrl: string;
  playersPerTeam: number;
  subsPerTeam: number;
  players: PlayerPerformance[];
};

export function TeamManagementPanel({
  canManageAll,
  canBuildTeams,
  defaultTournamentId,
  manageableTournamentIds,
  standalone = false
}: {
  canManageAll: boolean;
  canBuildTeams: boolean;
  defaultTournamentId?: string;
  manageableTournamentIds?: string[];
  standalone?: boolean;
}) {
  const { session, profile } = useAuthProfile();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [tournaments, setTournaments] = useState<TournamentOption[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [players, setPlayers] = useState<PlayerPerformance[]>([]);
  const [teams, setTeams] = useState<TeamCard[]>([]);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [teamLogoUrl, setTeamLogoUrl] = useState("");
  const [playersPerTeam, setPlayersPerTeam] = useState("5");
  const [subsPerTeam, setSubsPerTeam] = useState("0");
  const [selectedRoster, setSelectedRoster] = useState<string[]>([]);

  const selectedTournament = tournaments.find((item) => item.id === selectedTournamentId) ?? null;
  const manageableSet = useMemo(() => new Set(manageableTournamentIds ?? []), [manageableTournamentIds]);
  const selectedTournamentIsManageable = canManageAll || manageableSet.has(selectedTournamentId);

  const withCacheBust = useCallback((url: string | null | undefined) => {
    if (!url) return "";
    return url.includes("?") ? `${url}&v=${Date.now()}` : `${url}?v=${Date.now()}`;
  }, []);

  const loadTournamentTeams = useCallback(
    async (tournamentId: string, availablePlayers: PlayerPerformance[]) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase || !tournamentId) {
        setTeams([]);
        return;
      }

      let teamRows:
        | Array<{
            id: string;
            name: string;
            logo_url?: string | null;
            players_per_team: number;
            subs_per_team: number;
          }>
        | null = null;
      let teamErrorMessage = "";

      const initialTeamQuery = await supabase
        .from("tournament_teams")
        .select("id, name, logo_url, players_per_team, subs_per_team")
        .eq("tournament_id", tournamentId)
        .order("created_at", { ascending: true });

      if (
        initialTeamQuery.error?.message.includes("column tournament_teams.logo_url does not exist") ||
        initialTeamQuery.error?.message.includes("Could not find the 'logo_url' column")
      ) {
        const fallbackTeamQuery = await supabase
          .from("tournament_teams")
          .select("id, name, players_per_team, subs_per_team")
          .eq("tournament_id", tournamentId)
          .order("created_at", { ascending: true });

        teamRows = ((fallbackTeamQuery.data ?? []) as Array<{
          id: string;
          name: string;
          players_per_team: number;
          subs_per_team: number;
        }>).map((team) => ({ ...team, logo_url: null }));
        teamErrorMessage = fallbackTeamQuery.error?.message ?? "";
      } else {
        teamRows = (initialTeamQuery.data ?? []) as Array<{
          id: string;
          name: string;
          logo_url?: string | null;
          players_per_team: number;
          subs_per_team: number;
        }>;
        teamErrorMessage = initialTeamQuery.error?.message ?? "";
      }

      const { data: rosterRows, error: rosterError } = await supabase
        .from("tournament_teams")
        .select("id, team_players(player_id)")
        .eq("tournament_id", tournamentId)
        .order("created_at", { ascending: true });

      if (teamErrorMessage || rosterError) {
        setTeams([]);
        setMessage(`Team data could not be loaded: ${teamErrorMessage || rosterError?.message || "Unknown error"}`);
        return;
      }

      const playerMap = new Map(availablePlayers.map((player) => [player.id, player]));
      const rosterMap = new Map(
        (rosterRows ?? []).map((team) => [
          team.id,
          ((team.team_players as Array<{ player_id: string }> | null) ?? [])
            .map((row) => playerMap.get(row.player_id))
            .filter((item): item is PlayerPerformance => Boolean(item))
        ])
      );

      setTeams(
        (teamRows ?? []).map((team) => ({
          id: team.id,
          name: team.name,
          logoUrl: withCacheBust(team.logo_url),
          playersPerTeam: team.players_per_team,
          subsPerTeam: team.subs_per_team,
          players: rosterMap.get(team.id) ?? []
        }))
      );
    },
    [withCacheBust]
  );

  const loadPlayersAndTeams = useCallback(
    async (tournamentId: string) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase || !tournamentId) {
        setPlayers([]);
        setTeams([]);
        return;
      }

      const [{ data: participantRows, error: participantError }, { data: leaderboardRows, error: leaderboardError }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("id, full_name, gamer_tag, avatar_url, club_name")
            .order("created_at", { ascending: true }),
          supabase
            .from("club_leaderboard")
            .select("player_id, matches, points, goals_scored, wins, draws, losses")
        ]);

      if (participantError || leaderboardError) {
        setPlayers([]);
        setTeams([]);
        setMessage(
          `Tournament squad could not be loaded: ${participantError?.message ?? leaderboardError?.message ?? "Unknown error"}`
        );
        return;
      }

      const leaderboardMap = new Map(
        ((leaderboardRows ?? []) as Array<{
          player_id: string;
          matches: number;
          points: number;
          goals_scored: number;
          wins: number;
          draws: number;
          losses: number;
        }>).map((row) => [
          row.player_id,
          {
            matches: row.matches ?? 0,
            points: row.points ?? 0,
            goals: row.goals_scored ?? 0,
            wins: row.wins ?? 0,
            draws: row.draws ?? 0,
            losses: row.losses ?? 0
          }
        ])
      );

      const allProfiles = (participantRows ?? []) as Array<{
        id: string;
        full_name?: string | null;
        gamer_tag?: string | null;
        avatar_url?: string | null;
        club_name?: string | null;
      }>;

      const normalizeClub = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";
      const targetClub = normalizeClub(profile.club);
      const sameClubProfiles = allProfiles.filter((row) => normalizeClub(row.club_name) === targetClub);
      const sourceProfiles = sameClubProfiles.length >= 4 ? sameClubProfiles : allProfiles;

      const nextPlayers = sourceProfiles.map((row) => {
        const stats = leaderboardMap.get(row.id);
        return {
          id: row.id,
          name: row.gamer_tag || row.full_name || "Player",
          avatarUrl: row.avatar_url ?? undefined,
          matches: stats?.matches ?? 0,
          points: stats?.points ?? 0,
          goals: stats?.goals ?? 0,
          wins: stats?.wins ?? 0,
          draws: stats?.draws ?? 0,
          losses: stats?.losses ?? 0
        };
      });

      setPlayers(nextPlayers);
      await loadTournamentTeams(tournamentId, nextPlayers);
    },
    [loadTournamentTeams, profile.club]
  );

  const loadTournamentOptions = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage("");

    const { data: tournamentRows, error } = await supabase
      .from("tournaments")
      .select("id, name, slot_count")
      .eq("lifecycle_state", "active")
      .order("created_at", { ascending: false });

    if (error) {
      setTournaments([]);
      setLoading(false);
      setMessage(`Tournament options could not be loaded: ${error.message}`);
      return;
    }

    const options = ((tournamentRows ?? []) as Array<{ id: string; name: string; slot_count: number | null }>).map((row) => ({
      id: row.id,
      name: row.name,
      slotCount: row.slot_count ?? 5
    }));

    setTournaments(options);

    const nextTournamentId = options.find((item) => item.id === defaultTournamentId)?.id ?? options[0]?.id ?? "";
    setSelectedTournamentId(nextTournamentId);

    if (nextTournamentId) {
      const currentTournament = options.find((item) => item.id === nextTournamentId);
      setPlayersPerTeam(String(currentTournament?.slotCount ?? 5));
      setSelectedRoster([]);
      await loadPlayersAndTeams(nextTournamentId);
    } else {
      setPlayers([]);
      setTeams([]);
    }

    setLoading(false);
  }, [defaultTournamentId, loadPlayersAndTeams]);

  const syncTeams = useEffectEvent(() => {
    void loadTournamentOptions();
  });

  useEffect(() => {
    syncTeams();
  }, [canBuildTeams, canManageAll, defaultTournamentId, manageableTournamentIds]);

  async function handleTournamentChange(tournamentId: string) {
    setSelectedTournamentId(tournamentId);
    resetDraft();
    const nextTournament = tournaments.find((item) => item.id === tournamentId);
    setPlayersPerTeam(String(nextTournament?.slotCount ?? 5));
    await loadPlayersAndTeams(tournamentId);
  }

  function resetDraft() {
    setEditingTeamId(null);
    setTeamName("");
    setTeamLogoUrl("");
    setSubsPerTeam("0");
    setSelectedRoster([]);
  }

  function toggleRosterPlayer(playerId: string) {
    setSelectedRoster((current) =>
      current.includes(playerId) ? current.filter((item) => item !== playerId) : [...current, playerId]
    );
  }

  async function persistTeam() {
    if (!canBuildTeams || !selectedTournamentIsManageable) {
      setMessage("Only Admin, Super Admin, tournament captain, or vice-captain can create or edit teams here.");
      return;
    }

    if (!selectedTournamentId) {
      setMessage("Choose a tournament first.");
      return;
    }

    if (!teamName.trim()) {
      setMessage("Enter a team name.");
      return;
    }

    const nextPlayersPerTeam = Math.max(1, Number(playersPerTeam) || 1);
    const nextSubsPerTeam = Math.max(0, Number(subsPerTeam) || 0);
    const minimumRoster = nextPlayersPerTeam + nextSubsPerTeam;

    if (selectedRoster.length < minimumRoster) {
      setMessage(`Pick at least ${minimumRoster} players for this team.`);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setSaving(true);
    setMessage("");

    const basePayload = {
      tournament_id: selectedTournamentId,
      name: teamName.trim(),
      players_per_team: nextPlayersPerTeam,
      subs_per_team: nextSubsPerTeam
    };

    const payloadWithLogo = {
      ...basePayload,
      logo_url: teamLogoUrl.trim() || null
    };

    const operation = editingTeamId
      ? supabase.from("tournament_teams").update(payloadWithLogo).eq("id", editingTeamId).select("id").single()
      : supabase.from("tournament_teams").insert(payloadWithLogo).select("id").single();

    let teamWrite = await operation;

    if (
      teamWrite.error?.message.includes("column \"logo_url\" of relation \"tournament_teams\" does not exist") ||
      teamWrite.error?.message.includes("Could not find the 'logo_url' column")
    ) {
      teamWrite = editingTeamId
        ? await supabase.from("tournament_teams").update(basePayload).eq("id", editingTeamId).select("id").single()
        : await supabase.from("tournament_teams").insert(basePayload).select("id").single();

      if (!teamWrite.error) {
        setMessage(
          editingTeamId
            ? "Team updated. Add the latest SQL migration to save team photos too."
            : "Team created. Add the latest SQL migration to save team photos too."
        );
      }
    }

    if (teamWrite.error || !teamWrite.data) {
      if (teamWrite.error?.message.includes("duplicate key value violates unique constraint")) {
        setMessage("A team with this name already exists in the selected tournament.");
        setSaving(false);
        return;
      }

      setMessage(`Team could not be saved: ${teamWrite.error?.message ?? "Unknown error"}`);
      setSaving(false);
      return;
    }

    const teamId = teamWrite.data.id;

    const { error: clearRosterError } = await supabase.from("team_players").delete().eq("team_id", teamId);
    if (clearRosterError) {
      setMessage(`Team saved, but old roster could not be cleared: ${clearRosterError.message}`);
      setSaving(false);
      return;
    }

    const { error: rosterError } = await supabase.from("team_players").insert(
      selectedRoster.map((playerId) => ({
        team_id: teamId,
        player_id: playerId
      }))
    );

    if (rosterError) {
      setMessage(`Team saved, but roster assignment failed: ${rosterError.message}`);
      setSaving(false);
      await loadPlayersAndTeams(selectedTournamentId);
      return;
    }

    const actionLabel = editingTeamId ? "Team updated." : "Tournament team created.";
    resetDraft();
    setMessage(actionLabel);
    await loadPlayersAndTeams(selectedTournamentId);
    setSaving(false);
  }

  async function handleDeleteTeam(teamId: string) {
    if (!canManageAll) {
      setMessage("Only Admin and Super Admin can delete tournament teams.");
      return;
    }

    if (typeof window !== "undefined") {
      const confirmed = window.confirm("Delete this team and its roster?");
      if (!confirmed) return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setDeletingTeamId(teamId);
    setMessage("");

    const { error } = await supabase.from("tournament_teams").delete().eq("id", teamId);
    if (error) {
      setMessage(`Team could not be deleted: ${error.message}`);
      setDeletingTeamId(null);
      return;
    }

    if (editingTeamId === teamId) {
      resetDraft();
    }

    setMessage("Team deleted.");
    setDeletingTeamId(null);
    await loadPlayersAndTeams(selectedTournamentId);
  }

  function handleEditTeam(team: TeamCard) {
    if (!selectedTournamentIsManageable) {
      setMessage("You can only edit teams for tournaments you manage.");
      return;
    }

    setEditingTeamId(team.id);
    setTeamName(team.name);
    setTeamLogoUrl(withCacheBust(team.logoUrl));
    setPlayersPerTeam(String(team.playersPerTeam));
    setSubsPerTeam(String(team.subsPerTeam));
    setSelectedRoster(team.players.map((player) => player.id));
    setMessage("Editing team. Update the logo, name, slots, or roster, then save.");
  }

  async function handleTeamLogoUpload(file: File | null) {
    if (!file) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase || !session) {
      setMessage("Sign in first to upload a team photo.");
      return;
    }

    setUploadingLogo(true);
    setMessage("");

    const extension = file.name.split(".").pop() || "jpg";
    const path = `${session.user.id}/team-logos/team-logo-${Date.now()}.${extension}`;

    const { error } = await supabase.storage.from("avatars").upload(path, file, {
      upsert: true,
      cacheControl: "3600"
    });

    if (error) {
      setMessage(`Team photo upload failed: ${error.message}`);
      setUploadingLogo(false);
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setTeamLogoUrl(withCacheBust(data.publicUrl));
    setMessage(editingTeamId ? "Team photo uploaded. Save team to apply it." : "Team photo uploaded. Create team to apply it.");
    setUploadingLogo(false);
  }

  const rosterSummary = useMemo(
    () =>
      players
        .filter((player) => selectedRoster.includes(player.id))
        .sort((a, b) => b.points - a.points || b.goals - a.goals || a.losses - b.losses),
    [players, selectedRoster]
  );

  return (
    <Panel className="p-4 sm:p-5">
      <SectionHeading
        eyebrow={standalone ? "Club Teams" : "Tournament Teams"}
        title={canBuildTeams ? "Team Builder" : "Tournament Squads"}
        description={
          canBuildTeams
            ? "Create, edit, or delete tournament teams. Upload a team photo, manage the roster, and keep existing match-day lineups intact."
            : "View active tournament squads and player assignments."
        }
      />

      {message ? (
        <div className="mt-4 rounded-xl border border-[#00D4FF]/20 bg-[#00D4FF]/10 px-3 py-2 text-sm text-[#C5F5FF]">
          {message}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-4 rounded-xl border border-white/8 bg-black/20 px-4 py-4 text-sm text-[color:var(--text-muted)]">
          Loading tournament teams...
        </div>
      ) : (
        <>
          <div className={`mt-4 grid gap-4 ${canBuildTeams ? "xl:grid-cols-[1.1fr_0.9fr]" : ""}`}>
            {canBuildTeams ? (
              <>
                <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <SelectField
                      label="Tournament"
                      value={selectedTournamentId}
                      onChange={(value) => void handleTournamentChange(value)}
                      options={tournaments.map((item) => ({ label: item.name, value: item.id }))}
                      placeholder="Select tournament"
                    />
                    <Field
                      label="Team name"
                      value={teamName}
                      onChange={setTeamName}
                      placeholder={selectedTournament ? `${selectedTournament.name} Team A` : "Shield Entity Team"}
                    />
                    <Field
                      label="Team logo URL"
                      value={teamLogoUrl}
                      onChange={setTeamLogoUrl}
                      placeholder="https://.../team-logo.png"
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Main slots" value={playersPerTeam} onChange={setPlayersPerTeam} placeholder="5" type="number" />
                      <Field label="Subs" value={subsPerTeam} onChange={setSubsPerTeam} placeholder="0" type="number" />
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <TeamLogo src={teamLogoUrl} name={teamName || "Team"} />
                    <div className="text-sm text-[color:var(--text-muted)]">
                      {editingTeamId ? "Current team photo preview. Upload and save to replace it." : "Team photo preview."}
                    </div>
                  </div>

                  <label className="mt-3 block space-y-2">
                    <span className="text-sm text-[color:var(--text-muted)]">Upload team photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => void handleTeamLogoUpload(event.target.files?.[0] ?? null)}
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition file:mr-4 file:rounded-xl file:border-0 file:bg-[#00D4FF]/12 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[#00D4FF]"
                    />
                  </label>

                  {!selectedTournamentIsManageable ? (
                    <div className="mt-4 rounded-xl border border-[#7A5CFF]/25 bg-[#7A5CFF]/10 px-3 py-2 text-sm text-[#E3DAFF]">
                      Team building is limited to Admin, Super Admin, tournament captain, or vice-captain for the selected tournament.
                    </div>
                  ) : null}

                  <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">Tournament Players</p>
                        <p className="text-xs text-[color:var(--text-muted)]">
                          Pick the players for this team. Editing a roster keeps existing saved match lineups unchanged.
                        </p>
                      </div>
                      <StatusPill label={`${selectedRoster.length} selected`} tone="info" />
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {players.map((player) => (
                        <button
                          key={player.id}
                          type="button"
                          onClick={() => toggleRosterPlayer(player.id)}
                          disabled={!selectedTournamentIsManageable}
                          className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${
                            selectedRoster.includes(player.id)
                              ? "border-[#00FF88]/30 bg-[#00FF88]/10"
                              : "border-white/8 bg-black/20"
                          } disabled:cursor-not-allowed disabled:opacity-60`}
                        >
                          <UserAvatar src={player.avatarUrl} name={player.name} className="h-12 w-12 rounded-2xl" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-white">{player.name}</p>
                            <p className="text-xs text-[color:var(--text-muted)]">
                              {player.points} pts • {player.goals} goals • {player.matches} matches
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    {editingTeamId ? (
                      <button
                        type="button"
                        onClick={resetDraft}
                        className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white sm:w-auto"
                      >
                        Cancel Edit
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void persistTeam()}
                      disabled={!selectedTournamentId || !selectedTournamentIsManageable || saving || uploadingLogo}
                      className="w-full rounded-2xl border border-[#00FF88]/30 bg-[#00FF88]/10 px-4 py-3 text-sm font-semibold text-[#00FF88] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    >
                      {saving ? "Saving..." : uploadingLogo ? "Uploading..." : editingTeamId ? "Update Team" : "Create Team"}
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Roster Preview</p>
                      <p className="text-xs text-[color:var(--text-muted)]">
                        Avatars and live performance for the team draft or edit selection.
                      </p>
                    </div>
                    <ShieldPlus className="h-5 w-5 text-[#00D4FF]" />
                  </div>

                  <div className="mt-4 space-y-3">
                    {rosterSummary.length ? (
                      rosterSummary.map((player) => <PlayerPerformanceRow key={player.id} player={player} />)
                    ) : (
                      <EmptyState
                        icon={Users}
                        title="No roster selected"
                        description="Choose players on the left to build or edit the team."
                      />
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                <SelectField
                  label="Tournament"
                  value={selectedTournamentId}
                  onChange={(value) => void handleTournamentChange(value)}
                  options={tournaments.map((item) => ({ label: item.name, value: item.id }))}
                  placeholder="Select tournament"
                />
              </div>
            )}
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between gap-3">
              <SectionHeading
                eyebrow="Saved Teams"
                title="Tournament Squads"
                description="Teams for the selected tournament appear here automatically after registration."
              />
              <StatusPill label={`${teams.length} teams`} tone="neutral" />
            </div>

            {teams.length ? (
              <div className="mt-4 grid gap-4 2xl:grid-cols-2">
                {teams.map((team) => (
                  <article key={team.id} className="overflow-hidden rounded-3xl border border-white/8 bg-black/20">
                    <div className="flex flex-col gap-4 border-b border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(0,255,136,0.12),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-4">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-4">
                          <TeamLogo src={team.logoUrl} name={team.name} />
                          <div>
                            <h3 className="text-lg font-semibold text-white">{team.name}</h3>
                            <p className="text-sm text-[color:var(--text-muted)]">
                              {selectedTournament?.name ?? "Tournament"} • {team.playersPerTeam} main • {team.subsPerTeam} subs
                            </p>
                          </div>
                        </div>
                        <StatusPill label={`${team.players.length} players`} tone="success" />
                      </div>

                      {selectedTournamentIsManageable ? (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          {canBuildTeams ? (
                            <button
                              type="button"
                              onClick={() => handleEditTeam(team)}
                              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#00D4FF]/30 px-4 py-2 text-sm font-semibold text-[#8BE8FF]"
                            >
                              <FilePenLine className="h-4 w-4" />
                              Edit Team
                            </button>
                          ) : null}
                          {canManageAll ? (
                            <button
                              type="button"
                              onClick={() => void handleDeleteTeam(team.id)}
                              disabled={deletingTeamId === team.id}
                              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#FF5470]/30 px-4 py-2 text-sm font-semibold text-[#FF9BAC] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Trash2 className="h-4 w-4" />
                              {deletingTeamId === team.id ? "Deleting..." : "Delete Team"}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="grid gap-3 p-4">
                      {team.players.length ? (
                        team.players
                          .sort((a, b) => b.points - a.points || b.goals - a.goals || a.losses - b.losses)
                          .map((player) => <PlayerPerformanceRow key={`${team.id}-${player.id}`} player={player} compact />)
                      ) : (
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-5 text-sm text-[color:var(--text-muted)]">
                          This team does not have players assigned yet.
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-4">
                <EmptyState
                  icon={ShieldPlus}
                  title="No teams created yet"
                  description="Create a tournament team like Shield Entity Team for Leaders Cup and it will show up here automatically."
                />
              </div>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}

function PlayerPerformanceRow({
  player,
  compact = false
}: {
  player: PlayerPerformance;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-3">
      <UserAvatar src={player.avatarUrl} name={player.name} className="h-12 w-12 rounded-2xl" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{player.name}</p>
        <p className="text-xs text-[color:var(--text-muted)]">
          {player.wins}W • {player.draws}D • {player.losses}L
        </p>
      </div>
      <div className={`grid gap-1 text-right ${compact ? "min-w-[96px]" : "min-w-[116px]"}`}>
        <p className="text-sm font-semibold text-[#00FF88]">{player.points} pts</p>
        <p className="text-xs text-[color:var(--text-muted)]">
          {player.goals} goals • {player.matches} matches
        </p>
      </div>
    </div>
  );
}

function TeamLogo({ src, name }: { src?: string; name: string }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (src && !imageFailed) {
    return (
      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black/20">
        <img
          src={src}
          alt={`${name} logo`}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(0,255,136,0.18),rgba(0,212,255,0.16))] text-xs font-semibold uppercase tracking-[0.18em] text-white">
      {name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("") || "TM"}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm text-[color:var(--text-muted)]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-[#00D4FF]/30"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  placeholder: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm text-[color:var(--text-muted)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-[#00D4FF]/30"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
