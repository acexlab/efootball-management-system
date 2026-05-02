"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusPill } from "@/components/ui/status-pill";
import { loadNextTournamentMatchNumber } from "@/lib/matchday";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { TournamentTeam } from "@/lib/types";

type TournamentOption = {
  id: string;
  name: string;
};

type TeamPlayer = {
  id: string;
  name: string;
};

type LineupRole = "main" | "sub";

export function MatchLineupManager({
  canManageAll,
  manageableTournamentIds
}: {
  canManageAll: boolean;
  manageableTournamentIds: string[];
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [tournaments, setTournaments] = useState<TournamentOption[]>([]);
  const [teams, setTeams] = useState<TournamentTeam[]>([]);
  const [teamPlayers, setTeamPlayers] = useState<TeamPlayer[]>([]);
  const [rosterOptions, setRosterOptions] = useState<TeamPlayer[]>([]);
  const [rosterPlayers, setRosterPlayers] = useState<string[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [matchNumber, setMatchNumber] = useState("1");
  const [mainPlayers, setMainPlayers] = useState<string[]>([]);
  const [subPlayers, setSubPlayers] = useState<string[]>([]);
  const [savingRoster, setSavingRoster] = useState(false);

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? null;
  const canEditTournament = canManageAll || manageableTournamentIds.includes(selectedTournamentId);

  const loadSuggestedMatchNumber = useCallback(async (tournamentId: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !tournamentId) return "1";

    try {
      const nextMatchNumber = await loadNextTournamentMatchNumber(supabase, tournamentId);
      setMatchNumber(nextMatchNumber);
      return nextMatchNumber;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Could not load match days.";
      setMessage(`Match day suggestion could not be loaded: ${detail}`);
      return "1";
    }
  }, []);

  const loadLineupState = useCallback(
    async (tournamentId: string, teamId: string, nextMatchNumber: string) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase || !tournamentId || !teamId) return;

      const { data: teamPlayerRows, error: teamPlayersError } = await supabase
        .from("team_players")
        .select("player_id, profiles!inner(id, full_name, gamer_tag)")
        .eq("team_id", teamId);

      if (teamPlayersError) {
        if (
          teamPlayersError.message.includes("Could not find the table 'public.team_players'") ||
          teamPlayersError.message.includes("relation \"public.team_players\" does not exist")
        ) {
          setTeamPlayers([]);
          setMessage("Run the latest full-management-setup.sql to enable match-day main/sub lineups.");
          return;
        }

        setTeamPlayers([]);
        setMessage(`Could not load team players: ${teamPlayersError.message}`);
        return;
      }

      setTeamPlayers(
        (teamPlayerRows ?? []).map((row) => ({
          id: row.player_id,
          name:
            (row.profiles as { full_name?: string | null; gamer_tag?: string | null } | null)?.gamer_tag ||
            (row.profiles as { full_name?: string | null; gamer_tag?: string | null } | null)?.full_name ||
            "Player"
        }))
      );

      const { data: matchRow } = await supabase
        .from("matches")
        .select("id")
        .eq("tournament_id", tournamentId)
        .eq("match_number", Number(nextMatchNumber) || 1)
        .maybeSingle();

      if (!matchRow?.id) {
        setMainPlayers([]);
        setSubPlayers([]);
        return;
      }

      const { data: lineupRows, error: lineupError } = await supabase
        .from("match_lineups")
        .select("player_id, role")
        .eq("match_id", matchRow.id)
        .eq("team_id", teamId);

      if (lineupError) {
        if (
          lineupError.message.includes("Could not find the table 'public.match_lineups'") ||
          lineupError.message.includes("relation \"public.match_lineups\" does not exist")
        ) {
          setMessage("Run the latest full-management-setup.sql to enable match-day main/sub lineups.");
          return;
        }

        setMessage(`Could not load saved lineup: ${lineupError.message}`);
        return;
      }

      setMainPlayers((lineupRows ?? []).filter((row) => row.role === "main").map((row) => row.player_id));
      setSubPlayers((lineupRows ?? []).filter((row) => row.role === "sub").map((row) => row.player_id));
    },
    []
  );

  const loadRosterState = useCallback(
    async (tournamentId: string, teamId: string) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase || !tournamentId || !teamId) return;

      const { data: participantRows, error: participantError } = await supabase
        .from("tournament_participants")
        .select("user_id, profiles!inner(full_name, gamer_tag)")
        .eq("tournament_id", tournamentId);

      if (participantError) {
        setRosterOptions([]);
        setRosterPlayers([]);
        setMessage(`Could not load tournament squad: ${participantError.message}`);
        return;
      }

      const options = (participantRows ?? []).map((row) => ({
        id: row.user_id,
        name:
          (row.profiles as { full_name?: string | null; gamer_tag?: string | null } | null)?.gamer_tag ||
          (row.profiles as { full_name?: string | null; gamer_tag?: string | null } | null)?.full_name ||
          "Player"
      }));

      setRosterOptions(options);

      const { data: rosterRows, error: rosterError } = await supabase
        .from("team_players")
        .select("player_id")
        .eq("team_id", teamId);

      if (rosterError) {
        if (
          rosterError.message.includes("Could not find the table 'public.team_players'") ||
          rosterError.message.includes("relation \"public.team_players\" does not exist")
        ) {
          setMessage("Run the latest full-management-setup.sql to enable squad swaps.");
          setRosterPlayers([]);
          return;
        }

        setMessage(`Could not load squad roster: ${rosterError.message}`);
        setRosterPlayers([]);
        return;
      }

      const savedRoster = (rosterRows ?? []).map((row) => row.player_id);
      const nextRoster = savedRoster.length ? savedRoster : options.map((item) => item.id);
      setRosterPlayers(nextRoster);
      setTeamPlayers(options.filter((player) => nextRoster.includes(player.id)));
    },
    []
  );

  const loadOptions = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data: tournamentRows, error: tournamentsError } = await supabase
      .from("tournaments")
      .select("id, name")
      .order("created_at", { ascending: false });

    if (tournamentsError) {
      setMessage(`Could not load tournament options: ${tournamentsError.message}`);
      setLoading(false);
      return;
    }

    const tournamentOptions = (tournamentRows ?? []) as TournamentOption[];
    const filteredOptions = canManageAll
      ? tournamentOptions
      : tournamentOptions.filter((item) => manageableTournamentIds.includes(item.id));
    setTournaments(filteredOptions);

    const initialTournamentId = selectedTournamentId || filteredOptions[0]?.id || "";
    setSelectedTournamentId(initialTournamentId);

    if (!initialTournamentId) {
      if (!canManageAll) {
        setMessage("Lineup access is limited to tournaments you captain.");
      }
      setTeams([]);
      setTeamPlayers([]);
      setLoading(false);
      return;
    }

    const { data: teamRows, error: teamsError } = await supabase
      .from("tournament_teams")
      .select("id, tournament_id, name, players_per_team, subs_per_team")
      .eq("tournament_id", initialTournamentId)
      .order("created_at", { ascending: true });

    if (teamsError) {
      if (
        teamsError.message.includes("Could not find the table 'public.tournament_teams'") ||
        teamsError.message.includes("relation \"public.tournament_teams\" does not exist")
      ) {
        setMessage("Run the latest full-management-setup.sql to enable match-day main/sub lineups.");
        setTeams([]);
        setTeamPlayers([]);
        setLoading(false);
        return;
      }

      setMessage(`Could not load teams: ${teamsError.message}`);
      setTeams([]);
      setTeamPlayers([]);
      setLoading(false);
      return;
    }

    const mappedTeams = (teamRows ?? []).map((row) => ({
      id: row.id,
      tournamentId: row.tournament_id,
      name: row.name,
      playersPerTeam: row.players_per_team,
      subsPerTeam: row.subs_per_team
    }));

    setTeams(mappedTeams);
    const initialTeamId = selectedTeamId || mappedTeams[0]?.id || "";
    setSelectedTeamId(initialTeamId);

    if (initialTeamId) {
      const suggestedMatchNumber = await loadSuggestedMatchNumber(initialTournamentId);
      await loadLineupState(initialTournamentId, initialTeamId, suggestedMatchNumber);
      await loadRosterState(initialTournamentId, initialTeamId);
    } else {
      setMatchNumber("1");
      setTeamPlayers([]);
      setMainPlayers([]);
      setSubPlayers([]);
      setRosterOptions([]);
      setRosterPlayers([]);
    }

    setLoading(false);
  }, [
    canManageAll,
    loadLineupState,
    loadRosterState,
    loadSuggestedMatchNumber,
    manageableTournamentIds,
    selectedTeamId,
    selectedTournamentId
  ]);

  const syncOptions = useEffectEvent(() => {
    void loadOptions();
  });

  useEffect(() => {
    syncOptions();
  }, [canManageAll, manageableTournamentIds]);

  async function handleTournamentChange(tournamentId: string) {
    setSelectedTournamentId(tournamentId);
    setSelectedTeamId("");
    setMainPlayers([]);
    setSubPlayers([]);

    const supabase = getSupabaseBrowserClient();
    if (!supabase || !tournamentId) return;

    const { data: teamRows, error } = await supabase
      .from("tournament_teams")
      .select("id, tournament_id, name, players_per_team, subs_per_team")
      .eq("tournament_id", tournamentId)
      .order("created_at", { ascending: true });

    if (error) {
      if (
        error.message.includes("Could not find the table 'public.tournament_teams'") ||
        error.message.includes("relation \"public.tournament_teams\" does not exist")
      ) {
        setMessage("Run the latest full-management-setup.sql to enable match-day main/sub lineups.");
        return;
      }

      setMessage(`Could not load teams: ${error.message}`);
      return;
    }

    const mappedTeams = (teamRows ?? []).map((row) => ({
      id: row.id,
      tournamentId: row.tournament_id,
      name: row.name,
      playersPerTeam: row.players_per_team,
      subsPerTeam: row.subs_per_team
    }));

    setTeams(mappedTeams);
    const nextTeamId = mappedTeams[0]?.id || "";
    setSelectedTeamId(nextTeamId);
    if (nextTeamId) {
      const suggestedMatchNumber = await loadSuggestedMatchNumber(tournamentId);
      await loadLineupState(tournamentId, nextTeamId, suggestedMatchNumber);
      await loadRosterState(tournamentId, nextTeamId);
    } else {
      setMatchNumber("1");
      setTeamPlayers([]);
      setRosterOptions([]);
      setRosterPlayers([]);
    }
  }

  async function handleTeamChange(teamId: string) {
    setSelectedTeamId(teamId);
    setMainPlayers([]);
    setSubPlayers([]);
    if (selectedTournamentId && teamId) {
      await loadLineupState(selectedTournamentId, teamId, matchNumber);
      await loadRosterState(selectedTournamentId, teamId);
    }
  }

  async function handleMatchNumberChange(value: string) {
    setMatchNumber(value);
    if (selectedTournamentId && selectedTeamId) {
      await loadLineupState(selectedTournamentId, selectedTeamId, value);
    }
  }

  function toggleRosterPlayer(playerId: string) {
    setRosterPlayers((current) => {
      const exists = current.includes(playerId);
      if (exists) return current.filter((item) => item !== playerId);
      return [...current, playerId];
    });
  }

  function toggleSelection(playerId: string, role: LineupRole) {
    if (!selectedTeam) return;

    if (role === "main") {
      setMainPlayers((current) => {
        const exists = current.includes(playerId);
        if (exists) return current.filter((item) => item !== playerId);
        if (current.length >= selectedTeam.playersPerTeam) return current;
        return [...current, playerId];
      });
      setSubPlayers((current) => current.filter((item) => item !== playerId));
      return;
    }

    setSubPlayers((current) => {
      const exists = current.includes(playerId);
      if (exists) return current.filter((item) => item !== playerId);
      if (current.length >= selectedTeam.subsPerTeam) return current;
      return [...current, playerId];
    });
    setMainPlayers((current) => current.filter((item) => item !== playerId));
  }

  const teamPlayerMap = useMemo(
    () => Object.fromEntries(teamPlayers.map((player) => [player.id, player.name])),
    [teamPlayers]
  );

  async function handleSaveLineup() {
    if (!canEditTournament) {
      setMessage("You can only edit lineups for tournaments you captain.");
      return;
    }

    if (!selectedTournamentId || !selectedTeamId || !selectedTeam) {
      setMessage("Select tournament and team first.");
      return;
    }

    if (mainPlayers.length !== selectedTeam.playersPerTeam) {
      setMessage(`Select exactly ${selectedTeam.playersPerTeam} main players.`);
      return;
    }

    if (subPlayers.length !== selectedTeam.subsPerTeam) {
      setMessage(`Select exactly ${selectedTeam.subsPerTeam} substitute players.`);
      return;
    }

    const uniqueIds = new Set([...mainPlayers, ...subPlayers]);
    if (uniqueIds.size !== mainPlayers.length + subPlayers.length) {
      setMessage("A player cannot be both main and substitute.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setSaving(true);
    setMessage("");

    const { data: matchRow, error: matchError } = await supabase
      .from("matches")
      .upsert(
        {
          tournament_id: selectedTournamentId,
          match_number: Number(matchNumber) || 1,
          home_player_id: mainPlayers[0] ?? null,
          away_player_id: mainPlayers[1] ?? null,
          status: "Upcoming",
          lineup_locked: false
        },
        { onConflict: "tournament_id,match_number" }
      )
      .select("id")
      .single();

    if (matchError) {
      setMessage(`Match could not be prepared: ${matchError.message}`);
      setSaving(false);
      return;
    }

    const { error: deleteError } = await supabase
      .from("match_lineups")
      .delete()
      .eq("match_id", matchRow.id)
      .eq("team_id", selectedTeamId);

    if (deleteError) {
      if (
        deleteError.message.includes("Could not find the table 'public.match_lineups'") ||
        deleteError.message.includes("relation \"public.match_lineups\" does not exist")
      ) {
        setMessage("Run the latest full-management-setup.sql to enable match-day main/sub lineups.");
        setSaving(false);
        return;
      }

      setMessage(`Existing lineup could not be cleared: ${deleteError.message}`);
      setSaving(false);
      return;
    }

    const lineupRows = [
      ...mainPlayers.map((playerId) => ({
        match_id: matchRow.id,
        team_id: selectedTeamId,
        player_id: playerId,
        role: "main" as const
      })),
      ...subPlayers.map((playerId) => ({
        match_id: matchRow.id,
        team_id: selectedTeamId,
        player_id: playerId,
        role: "sub" as const
      }))
    ];

    const { error: lineupError } = await supabase.from("match_lineups").insert(lineupRows);

    if (lineupError) {
      if (
        lineupError.message.includes("Could not find the table 'public.match_lineups'") ||
        lineupError.message.includes("relation \"public.match_lineups\" does not exist")
      ) {
        setMessage("Run the latest full-management-setup.sql to enable match-day main/sub lineups.");
        setSaving(false);
        return;
      }

      setMessage(`Lineup could not be saved: ${lineupError.message}`);
      setSaving(false);
      return;
    }

    setMessage("Match day lineup saved.");
    setMainPlayers([]);
    setSubPlayers([]);
    await loadSuggestedMatchNumber(selectedTournamentId);
    setSaving(false);
  }

  async function handleSaveRoster() {
    if (!canEditTournament) {
      setMessage("You can only edit lineups for tournaments you captain.");
      return;
    }

    if (!selectedTournamentId || !selectedTeamId || !selectedTeam) {
      setMessage("Select tournament and team first.");
      return;
    }

    const minPlayers = selectedTeam.playersPerTeam + selectedTeam.subsPerTeam;
    if (rosterPlayers.length < minPlayers) {
      setMessage(`Select at least ${minPlayers} players for the roster.`);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setSavingRoster(true);
    setMessage("");

    const { error: deleteError } = await supabase
      .from("team_players")
      .delete()
      .eq("team_id", selectedTeamId);

    if (deleteError) {
      setMessage(`Roster could not be cleared: ${deleteError.message}`);
      setSavingRoster(false);
      return;
    }

    const rosterRows = rosterPlayers.map((playerId) => ({
      team_id: selectedTeamId,
      player_id: playerId
    }));

    const { error: rosterError } = await supabase.from("team_players").insert(rosterRows);

    if (rosterError) {
      setMessage(`Roster could not be saved: ${rosterError.message}`);
      setSavingRoster(false);
      return;
    }

    const updatedRoster = rosterOptions.filter((player) => rosterPlayers.includes(player.id));
    setTeamPlayers(updatedRoster);
    setMainPlayers((current) => current.filter((playerId) => rosterPlayers.includes(playerId)));
    setSubPlayers((current) => current.filter((playerId) => rosterPlayers.includes(playerId)));
    setMessage("Tournament roster updated.");
    setSavingRoster(false);
  }

  return (
    <Panel className="p-4 sm:p-5">
      <SectionHeading eyebrow="Tournament options" title="Match Day Player Selection" />
      <div className="mt-2 flex flex-wrap gap-2">
        <StatusPill label={canEditTournament ? "Lineup Access Enabled" : "Lineup Access Locked"} tone={canEditTournament ? "success" : "warning"} />
      </div>

      {message ? (
        <div className="mt-4 rounded-xl border border-[#7A5CFF]/25 bg-[#7A5CFF]/10 px-3 py-2 text-sm text-[#E3DAFF]">
          {message}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-4 rounded-xl border border-white/8 bg-black/20 px-4 py-4 text-sm text-[color:var(--text-muted)]">
          Loading lineup options...
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 xl:grid-cols-3">
            <SelectField
              label="Tournament"
              value={selectedTournamentId}
              onChange={(value) => void handleTournamentChange(value)}
              options={tournaments.map((item) => ({ label: item.name, value: item.id }))}
              placeholder="Select tournament"
            />
            <SelectField
              label="Team"
              value={selectedTeamId}
              onChange={(value) => void handleTeamChange(value)}
              options={teams.map((item) => ({ label: item.name, value: item.id }))}
              placeholder="Select team"
            />
            <Field
              label="Match day"
              type="number"
              value={matchNumber}
              onChange={(value) => void handleMatchNumberChange(value)}
              placeholder="Auto"
              hint="After each save, the next open match day is suggested."
            />
          </div>

          {selectedTeam ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusPill label={`${selectedTeam.playersPerTeam} Main`} tone="success" />
              <StatusPill label={`${selectedTeam.subsPerTeam} Subs`} tone="info" />
              <StatusPill label={`${teamPlayers.length} Available`} tone="neutral" />
            </div>
          ) : null}

          <div className="mt-4 rounded-2xl border border-white/8 bg-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-white">Tournament Roster</p>
                <p className="text-xs text-[color:var(--text-muted)]">
                  Select the players who are available for this tournament. Minimum{" "}
                  {(selectedTeam?.playersPerTeam ?? 0) + (selectedTeam?.subsPerTeam ?? 0)} players.
                </p>
              </div>
              <span className="text-xs text-[color:var(--text-muted)]">
                {rosterPlayers.length}/{rosterOptions.length} selected
              </span>
            </div>
            <div className="mt-3 max-h-[320px] overflow-y-auto pr-1">
              <div className="grid gap-2 sm:grid-cols-2">
              {rosterOptions.map((player) => (
                <ToggleRow
                  key={`roster-${player.id}`}
                  name={player.name}
                  checked={rosterPlayers.includes(player.id)}
                  disabled={!canEditTournament}
                  onClick={() => toggleRosterPlayer(player.id)}
                />
              ))}
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => void handleSaveRoster()}
                disabled={!canEditTournament || !selectedTeam || savingRoster}
                className="w-full rounded-lg border border-[#00D4FF]/30 bg-[#00D4FF]/10 px-4 py-2 text-sm font-semibold text-[#00D4FF] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {savingRoster ? "Saving..." : "Save Roster"}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 2xl:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">Main Players</p>
                <span className="text-xs text-[color:var(--text-muted)]">
                  {mainPlayers.length}/{selectedTeam?.playersPerTeam ?? 0}
                </span>
              </div>
              <div className="mt-3 max-h-[320px] overflow-y-auto pr-1">
                <div className="grid gap-2">
                  {teamPlayers.map((player) => (
                    <ToggleRow
                      key={`main-${player.id}`}
                      name={player.name}
                      checked={mainPlayers.includes(player.id)}
                      disabled={subPlayers.includes(player.id)}
                      onClick={() => toggleSelection(player.id, "main")}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">Substitutes</p>
                <span className="text-xs text-[color:var(--text-muted)]">
                  {subPlayers.length}/{selectedTeam?.subsPerTeam ?? 0}
                </span>
              </div>
              <div className="mt-3 max-h-[320px] overflow-y-auto pr-1">
                <div className="grid gap-2">
                  {teamPlayers.map((player) => (
                    <ToggleRow
                      key={`sub-${player.id}`}
                      name={player.name}
                      checked={subPlayers.includes(player.id)}
                      disabled={mainPlayers.includes(player.id)}
                      onClick={() => toggleSelection(player.id, "sub")}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <SummaryBlock
              title="Saved Main"
              items={mainPlayers.map((playerId) => teamPlayerMap[playerId] ?? "Player")}
            />
            <SummaryBlock
              title="Saved Subs"
              items={subPlayers.map((playerId) => teamPlayerMap[playerId] ?? "Player")}
            />
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => void handleSaveLineup()}
              disabled={!canEditTournament || !selectedTeam || saving}
              className="w-full rounded-lg border border-[#00FF88]/30 bg-[#00FF88]/10 px-4 py-2 text-sm font-semibold text-[#00FF88] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {saving ? "Saving..." : "Save Lineup"}
            </button>
          </div>
        </>
      )}
    </Panel>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  hint
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  hint?: string;
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
      {hint ? <span className="block text-xs text-[color:var(--text-muted)]">{hint}</span> : null}
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

function ToggleRow({
  name,
  checked,
  disabled,
  onClick
}: {
  name: string;
  checked: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-[52px] items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left text-sm ${
        checked
          ? "border-[#00FF88]/30 bg-[#00FF88]/10 text-white"
          : "border-white/8 bg-white/[0.03] text-white"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      <span>{name}</span>
      <span className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
        {checked ? "Selected" : "Pick"}
      </span>
    </button>
  );
}

function SummaryBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
      <p className="text-sm font-semibold text-white">{title}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.length ? (
          items.map((item) => (
            <span key={`${title}-${item}`} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white">
              {item}
            </span>
          ))
        ) : (
          <span className="text-sm text-[color:var(--text-muted)]">No players selected</span>
        )}
      </div>
    </div>
  );
}
