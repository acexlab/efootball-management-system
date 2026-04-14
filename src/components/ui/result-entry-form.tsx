"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { loadNextTournamentMatchNumber } from "@/lib/matchday";
import { syncClubLeaderboardFromStats } from "@/lib/supabase/club-operations";
import { hasPermission } from "@/lib/rbac";
import type { PlayerOption, Role } from "@/lib/types";
import { useAuthProfile } from "@/hooks/use-auth-profile";

type TournamentOption = {
  id: string;
  name: string;
  slotCount: number;
};

type PlayerStatDraft = {
  goals: string;
  opponentGoals: string;
};

type ExistingMatchRow = {
  id: string;
  scheduled_at: string | null;
  venue: string | null;
  opponent_team: string | null;
  away_score: number | null;
  walkover: boolean | null;
  remarks: string | null;
};

export function ResultEntryForm({ role }: { role: Role }) {
  const searchParams = useSearchParams();
  const { session, profile } = useAuthProfile();
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tournaments, setTournaments] = useState<TournamentOption[]>([]);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [matchNumber, setMatchNumber] = useState("1");
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [venue, setVenue] = useState("Shield Arena");
  const [opponentTeam, setOpponentTeam] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [walkover, setWalkover] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [lineup, setLineup] = useState<string[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerStatDraft[]>([]);
  const [opponents, setOpponents] = useState<string[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const canSubmitByRole = hasPermission(role, "enter:results");
  const canManageTournaments = hasPermission(role, "manage:tournaments");
  const selectedTournament = tournaments.find((item) => item.id === selectedTournamentId) ?? null;
  const slotCount = selectedTournament?.slotCount ?? 0;
  const requestedTournamentId = searchParams.get("tournament") ?? "";
  const requestedMatchNumber = searchParams.get("match") ?? "";

  const buildDefaultLineupState = useCallback((nextSlotCount: number, nextPlayers: PlayerOption[]) => {
    const initialLineup = Array.from({ length: nextSlotCount }, (_, index) => nextPlayers[index]?.id ?? "");
    return {
      lineup: initialLineup,
      playerStats: Array.from({ length: nextSlotCount }, () => ({
        goals: "0",
        opponentGoals: "0"
      })),
      opponents: Array.from({ length: nextSlotCount }, () => "")
    };
  }, []);

  const resetMatchDetails = useCallback(
    (nextSlotCount: number, nextPlayers: PlayerOption[]) => {
      const defaults = buildDefaultLineupState(nextSlotCount, nextPlayers);
      setLineup(defaults.lineup);
      setPlayerStats(defaults.playerStats);
      setOpponents(defaults.opponents);
      setVenue("Shield Arena");
      setOpponentTeam("");
      setScheduledAt("");
      setWalkover(false);
      setRemarks("");
      setEditingMatchId(null);
    },
    [buildDefaultLineupState]
  );

  const loadSuggestedMatchNumber = useCallback(async (tournamentId: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !tournamentId) return "1";

    try {
      const nextMatchNumber = await loadNextTournamentMatchNumber(supabase, tournamentId);
      setMatchNumber(nextMatchNumber);
      return nextMatchNumber;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load match days.";
      setToast(`Match day suggestion could not be loaded: ${message}`);
      setMatchNumber("1");
      return "1";
    }
  }, []);

  const loadTournamentPlayers = useCallback(async (tournamentId: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return [] as PlayerOption[];

    const { data: participantRows, error: participantsError } = await supabase
      .from("tournament_participants")
      .select("user_id")
      .eq("tournament_id", tournamentId);

    if (participantsError) {
      setPlayers([]);
      setToast(`Could not load tournament squad: ${participantsError.message}`);
      return [];
    }

    const participantIds = (participantRows ?? []).map((item) => item.user_id);
    if (!participantIds.length) {
      setPlayers([]);
      return [];
    }

    const { data: profileRows, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, gamer_tag, role, avatar_url")
      .in("id", participantIds);

    if (profilesError) {
      setPlayers([]);
      setToast(`Could not load player identities: ${profilesError.message}`);
      return [];
    }

    const options: PlayerOption[] = (profileRows ?? []).map((item) => ({
      id: item.id,
      name: item.gamer_tag || item.full_name || "Shield Member",
      role: (item.role as Role | null) ?? "Player",
      avatarUrl: item.avatar_url ?? undefined
    }));

    setPlayers(options);
    return options;
  }, []);

  const loadExistingMatch = useCallback(
    async (tournamentId: string, nextMatchNumber: string, nextSlotCount: number, nextPlayers: PlayerOption[]) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase || !tournamentId) {
        resetMatchDetails(nextSlotCount, nextPlayers);
        return;
      }

      const { data: matchRow, error: matchError } = await supabase
        .from("matches")
        .select("id, scheduled_at, venue, opponent_team, away_score, walkover, remarks")
        .eq("tournament_id", tournamentId)
        .eq("match_number", Number(nextMatchNumber) || 1)
        .maybeSingle();

      if (matchError) {
        resetMatchDetails(nextSlotCount, nextPlayers);
        setToast(`Saved result could not be loaded: ${matchError.message}`);
        return;
      }

      if (!matchRow) {
        resetMatchDetails(nextSlotCount, nextPlayers);
        return;
      }

      const [{ data: slotRows, error: slotsError }, { data: statRows, error: statsError }] = await Promise.all([
        supabase
          .from("match_slots")
          .select("slot_number, player_id")
          .eq("match_id", matchRow.id)
          .order("slot_number", { ascending: true }),
        supabase
          .from("match_stats")
          .select("player_id, goals, opponent_goals, opponent_name")
          .eq("match_id", matchRow.id)
      ]);

      if (slotsError || statsError) {
        resetMatchDetails(nextSlotCount, nextPlayers);
        setToast(`Saved result details could not be loaded: ${slotsError?.message ?? statsError?.message ?? "Unknown error"}`);
        return;
      }

      const defaults = buildDefaultLineupState(nextSlotCount, nextPlayers);
      const savedLineup = [...defaults.lineup];

      for (const slot of slotRows ?? []) {
        const slotIndex = Number(slot.slot_number) - 1;
        if (slotIndex >= 0 && slotIndex < savedLineup.length) {
          savedLineup[slotIndex] = slot.player_id;
        }
      }

      const statsByPlayer = new Map(
        (statRows ?? []).map((row) => [
          row.player_id,
          {
            goals: String(Number(row.goals ?? 0)),
            opponentGoals: String(Number((row as { opponent_goals?: number | null }).opponent_goals ?? 0)),
            opponent: row.opponent_name ?? ""
          }
        ])
      );

      setLineup(savedLineup);
      setPlayerStats(
        savedLineup.map((playerId, index) => {
          const saved = playerId ? statsByPlayer.get(playerId) : undefined;
          return saved ?? defaults.playerStats[index];
        })
      );
      setOpponents(
        savedLineup.map((playerId, index) => {
          const saved = playerId ? statsByPlayer.get(playerId) : undefined;
          return saved?.opponent ?? defaults.opponents[index];
        })
      );
      setVenue(matchRow.venue || "Shield Arena");
      setOpponentTeam(matchRow.opponent_team || "");
      setScheduledAt(toDateTimeLocalValue(matchRow.scheduled_at));
      setWalkover(Boolean(matchRow.walkover));
      setRemarks(matchRow.remarks || "");
      setEditingMatchId(matchRow.id);
    },
    [buildDefaultLineupState, resetMatchDetails]
  );

  const hydrateResultForm = useCallback(
    async (tournamentId: string, nextMatchNumber: string, nextSlotCount: number) => {
      const nextPlayers = await loadTournamentPlayers(tournamentId);
      await loadExistingMatch(tournamentId, nextMatchNumber, nextSlotCount, nextPlayers);
    },
    [loadExistingMatch, loadTournamentPlayers]
  );

  const loadAccessibleTournaments = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();

    if (!supabase || !session) {
      setTournaments([]);
      setPlayers([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    let response:
      | { data: Array<{ id: string; name: string; slot_count: number | null }> | null; error: { message: string } | null }
      | undefined;

    if (canManageTournaments) {
      response = await supabase
        .from("tournaments")
        .select("id, name, slot_count")
        .eq("lifecycle_state", "active")
        .order("created_at", { ascending: false });
    } else {
      const userId = profile.id ?? session.user.id;
      const { data: participantRows, error: participantError } = await supabase
        .from("tournament_participants")
        .select("tournament_id, role")
        .eq("user_id", userId)
        .in("role", ["captain", "vice_captain"]);

      if (participantError) {
        setToast(`Tournament access could not be loaded: ${participantError.message}`);
        setTournaments([]);
        setPlayers([]);
        setLoading(false);
        return;
      }

      const tournamentIds = (participantRows ?? []).map((row) => row.tournament_id);

      if (!tournamentIds.length) {
        setTournaments([]);
        setPlayers([]);
        setLoading(false);
        return;
      }

      response = await supabase
        .from("tournaments")
        .select("id, name, slot_count")
        .eq("lifecycle_state", "active")
        .in("id", tournamentIds)
        .order("created_at", { ascending: false });
    }

    if (response.error) {
      setToast(`Tournament access could not be loaded: ${response.error.message}`);
      setTournaments([]);
      setPlayers([]);
      setLoading(false);
      return;
    }

    const options = (response.data ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      slotCount: item.slot_count ?? 5
    }));

    setTournaments(options);
    setLoading(false);

    if (options.length) {
      const nextTournamentId =
        options.find((item) => item.id === requestedTournamentId)?.id ?? options[0].id;
      setSelectedTournamentId(nextTournamentId);
      const nextMatchNumber =
        requestedTournamentId === nextTournamentId && requestedMatchNumber
          ? requestedMatchNumber
          : await loadSuggestedMatchNumber(nextTournamentId);
      if (requestedTournamentId === nextTournamentId && requestedMatchNumber) {
        setMatchNumber(requestedMatchNumber);
      }
      await hydrateResultForm(nextTournamentId, nextMatchNumber, options[0].slotCount);
    } else {
      setSelectedTournamentId("");
      setMatchNumber("1");
      setPlayers([]);
      resetMatchDetails(0, []);
    }
  }, [
    canManageTournaments,
    hydrateResultForm,
    loadSuggestedMatchNumber,
    profile.id,
    requestedMatchNumber,
    requestedTournamentId,
    resetMatchDetails,
    session
  ]);

  const syncResultForm = useEffectEvent(() => {
    void loadAccessibleTournaments();
  });

  useEffect(() => {
    syncResultForm();
  }, [canManageTournaments, profile.id, role, session]);

  const canSubmit = canSubmitByRole && (canManageTournaments || tournaments.length > 0);

  const playerMap = useMemo(
    () => Object.fromEntries(players.map((player) => [player.id, player.name])),
    [players]
  );
  const clubScore = useMemo(
    () =>
      playerStats.reduce((sum, stat) => {
        const goals = Number(stat.goals || 0);
        return sum + (Number.isNaN(goals) ? 0 : goals);
      }, 0),
    [playerStats]
  );
  const opponentScore = useMemo(
    () =>
      playerStats.reduce((sum, stat) => {
        const goals = Number(stat.opponentGoals || 0);
        return sum + (Number.isNaN(goals) ? 0 : goals);
      }, 0),
    [playerStats]
  );

  async function handleTournamentChange(tournamentId: string) {
    setSelectedTournamentId(tournamentId);
    const nextTournament = tournaments.find((item) => item.id === tournamentId);
    if (!nextTournament) {
      resetMatchDetails(0, []);
      setMatchNumber("1");
      setPlayers([]);
      return;
    }

    const nextMatchNumber = await loadSuggestedMatchNumber(tournamentId);
    await hydrateResultForm(tournamentId, nextMatchNumber, nextTournament.slotCount);
  }

  async function handleMatchNumberChange(value: string) {
    setMatchNumber(value);
    if (!selectedTournamentId || !selectedTournament) return;

    await loadExistingMatch(selectedTournamentId, value, selectedTournament.slotCount, players);
  }

  function handleLineupChange(index: number, playerId: string) {
    setLineup((state) => state.map((value, currentIndex) => (currentIndex === index ? playerId : value)));
  }

  function handleStatChange(index: number, update: Partial<PlayerStatDraft>) {
    setPlayerStats((state) =>
      state.map((item, currentIndex) => (currentIndex === index ? { ...item, ...update } : item))
    );
  }

  function handleOpponentChange(index: number, value: string) {
    setOpponents((state) => state.map((item, currentIndex) => (currentIndex === index ? value : item)));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      setToast("Your account can view the result flow, but cannot submit tournament data.");
      return;
    }

    if (!selectedTournament || !session) {
      setToast("Select a tournament first.");
      return;
    }

    const finalLineup = lineup.filter(Boolean);
    if (finalLineup.length !== slotCount) {
      setToast("Every slot must have a final player selected.");
      return;
    }

    if (new Set(finalLineup).size !== finalLineup.length) {
      setToast("A player can only appear in one slot.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setToast("Project configuration is missing.");
      return;
    }

    setSubmitting(true);
    setToast("");

    const { data: matchRow, error: matchError } = await supabase
      .from("matches")
      .upsert(
        {
          tournament_id: selectedTournament.id,
          match_number: Number(matchNumber) || 1,
          home_player_id: finalLineup[0] ?? null,
          away_player_id: finalLineup[1] ?? null,
          scheduled_at: scheduledAt || null,
          venue: venue.trim() || null,
          opponent_team: opponentTeam.trim() || null,
          status: "Completed",
          lineup_locked: true,
          home_score: clubScore,
          away_score: opponentScore,
          walkover,
          reported_by: profile.id ?? session.user.id,
          remarks: remarks.trim() || null
        },
        { onConflict: "tournament_id,match_number" }
      )
      .select("id")
      .single();

    if (matchError) {
      setToast(`Match could not be saved: ${matchError.message}`);
      setSubmitting(false);
      return;
    }

    await supabase.from("match_slots").delete().eq("match_id", matchRow.id);
    await supabase.from("match_stats").delete().eq("match_id", matchRow.id);

    const slotRows = finalLineup.map((playerId, index) => ({
      match_id: matchRow.id,
      slot_number: index + 1,
      player_id: playerId
    }));

    const { error: slotsError } = await supabase.from("match_slots").insert(slotRows);

    if (slotsError) {
      setToast(`Final lineup could not be saved: ${slotsError.message}`);
      setSubmitting(false);
      return;
    }

    const statRows = finalLineup.map((playerId, index) => ({
      match_id: matchRow.id,
      player_id: playerId,
      goals: Number(playerStats[index]?.goals || 0),
      opponent_goals: Number(playerStats[index]?.opponentGoals || 0),
      result: deriveResult(playerStats[index]),
      opponent_name: opponents[index]?.trim() || null,
      remarks: remarks.trim() || null,
      walkover
    }));

    const { error: statsError } = await supabase.from("match_stats").insert(statRows);

    if (statsError) {
      setToast(`Player stats could not be saved: ${statsError.message}`);
      setSubmitting(false);
      return;
    }

    try {
      await syncClubLeaderboardFromStats(supabase);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Leaderboard sync failed.";
      setToast(`Result saved, but leaderboard sync failed: ${message}`);
      setSubmitting(false);
      return;
    }

    setEditingMatchId(matchRow.id);
    setStep(1);
    setToast(editingMatchId ? "Match result updated." : "Match result saved.");
    await loadExistingMatch(selectedTournament.id, String(Number(matchNumber) || 1), slotCount, players);
    setSubmitting(false);
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-[color:var(--text-muted)]">
          Loading tournament access...
        </div>
      ) : null}

      {editingMatchId ? (
        <div className="rounded-2xl border border-[#00D4FF]/20 bg-[#00D4FF]/10 px-4 py-3 text-sm text-[#C5F5FF]">
          Editing saved result for match day {matchNumber}. Change any score, lineup, or player stat, then save again.
        </div>
      ) : null}

      <div className={`grid gap-3 lg:grid-cols-2 ${step === 1 ? "" : "opacity-60"}`}>
        <SelectField
          label="Tournament"
          value={selectedTournamentId}
          onChange={(value) => void handleTournamentChange(value)}
          options={tournaments.map((item) => ({ label: item.name, value: item.id }))}
          placeholder={tournaments.length ? "Select tournament" : "No active tournaments"}
        />
        <Field
          label="Match day"
          type="number"
          value={matchNumber}
          onChange={(value) => void handleMatchNumberChange(value)}
          placeholder="Auto"
          hint="Choose an existing match day to edit it, or use the next open one."
        />
        <Field
          label="Scheduled at"
          type="datetime-local"
          value={scheduledAt}
          onChange={setScheduledAt}
          placeholder=""
        />
        <Field label="Venue" type="text" value={venue} onChange={setVenue} placeholder="Shield Arena" />
        <Field
          label="Opponent team"
          type="text"
          value={opponentTeam}
          onChange={setOpponentTeam}
          placeholder="Opponent team name"
        />
      </div>
      {step === 1 ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setStep(2)}
            disabled={!selectedTournamentId}
            className="w-full rounded-lg border border-[#00FF88]/30 bg-[#00FF88]/10 px-4 py-2 text-sm font-semibold text-[#00FF88] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            Next: Lineup
          </button>
        </div>
      ) : null}

      <div className={`rounded-2xl border border-white/8 bg-black/20 p-4 ${step === 2 ? "" : "opacity-60"}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--text-muted)]">Final lineup</p>
            <p className="mt-2 text-sm text-white">
              Select the final players. Only selected players will receive stats.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {Array.from({ length: slotCount }).map((_, index) => (
            <div key={`slot-${index}`} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
                Slot {index + 1}
              </p>
              <select
                value={lineup[index] ?? ""}
                onChange={(event) => handleLineupChange(index, event.target.value)}
                className="mt-3 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-[#00D4FF]/30"
              >
                <option value="">Select player</option>
                {players.map((player) => {
                  const alreadyUsed = lineup.some(
                    (item, lineupIndex) => lineupIndex !== index && item === player.id
                  );

                  return (
                    <option key={player.id} value={player.id} disabled={alreadyUsed}>
                      {player.name}
                    </option>
                  );
                })}
              </select>
            </div>
          ))}
        </div>
      </div>
      {step === 2 ? (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setStep(1)}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white sm:w-auto"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => setStep(3)}
            className="w-full rounded-lg border border-[#00FF88]/30 bg-[#00FF88]/10 px-4 py-2 text-sm font-semibold text-[#00FF88] sm:w-auto"
          >
            Next: Stats
          </button>
        </div>
      ) : null}

      <div className={`rounded-2xl border border-white/8 bg-black/20 p-4 ${step === 3 ? "" : "opacity-60"}`}>
        <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--text-muted)]">Player stats</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field
            label="Shield score"
            type="number"
            value={String(clubScore)}
            onChange={() => {}}
            placeholder="0"
            hint="Calculated automatically from the player goals below."
            readOnly
          />
          <Field
            label="Opponent score"
            type="number"
            value={String(opponentScore)}
            onChange={() => {}}
            placeholder="0"
            hint="Calculated automatically from the opponent goals below."
            readOnly
          />
        </div>

        <div className="mt-3 grid gap-3">
          {Array.from({ length: slotCount }).map((_, index) => (
            <div
              key={`stat-${index}`}
              className="grid gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-3 lg:grid-cols-2 2xl:grid-cols-[1.2fr_0.7fr_0.9fr_0.7fr_0.7fr]"
            >
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">Player</p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {playerMap[lineup[index] ?? ""] ?? `Slot ${index + 1} not selected`}
                </p>
              </div>
              <Field
                label="Goals"
                type="number"
                value={playerStats[index]?.goals ?? "0"}
                onChange={(value) => handleStatChange(index, { goals: value })}
                placeholder="0"
              />
              <Field
                label="Opponent"
                type="text"
                value={opponents[index] ?? ""}
                onChange={(value) => handleOpponentChange(index, value)}
                placeholder="Opponent player"
              />
              <Field
                label="Opponent Goals"
                type="number"
                value={playerStats[index]?.opponentGoals ?? "0"}
                onChange={(value) => handleStatChange(index, { opponentGoals: value })}
                placeholder="0"
              />
              <Field
                label="Result"
                type="text"
                value={deriveDisplayResult(playerStats[index])}
                onChange={() => {}}
                placeholder="Draw"
                hint="Calculated from player goals vs opponent goals."
                readOnly
              />
            </div>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-4 text-sm text-white">
        <input
          type="checkbox"
          checked={walkover}
          onChange={(event) => setWalkover(event.target.checked)}
          className="h-4 w-4 accent-[#00FF88]"
        />
        Mark this match as a walkover
      </label>

      <label className="space-y-2">
        <span className="text-sm text-[color:var(--text-muted)]">Remarks</span>
        <textarea
          rows={5}
          value={remarks}
          onChange={(event) => setRemarks(event.target.value)}
          placeholder="Add notes about the final lineup, replacements, or match summary."
          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-[#00D4FF]/30"
        />
      </label>

      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-[color:var(--text-muted)]">
          Role gate: <span className="text-white">{role}</span>
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {step === 3 ? (
            <button
              type="button"
              onClick={() => setStep(2)}
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white sm:w-auto"
            >
              Back
            </button>
          ) : null}
          <button
            type="submit"
            disabled={submitting || !selectedTournamentId || step !== 3}
            className="w-full rounded-lg border border-[#00FF88]/30 bg-[#00FF88]/12 px-4 py-2 font-semibold text-[#00FF88] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {submitting ? "Saving..." : editingMatchId ? "Update Match Result" : "Save Match Result"}
          </button>
        </div>
      </div>

      {toast ? (
        <div className="rounded-2xl border border-[#00D4FF]/20 bg-[#00D4FF]/10 px-4 py-3 text-sm text-[#C5F5FF]">
          {toast}
        </div>
      ) : null}
    </form>
  );
}

function toDateTimeLocalValue(value: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function deriveResult(stat?: PlayerStatDraft) {
  const playerGoals = Number(stat?.goals || 0);
  const opponentGoals = Number(stat?.opponentGoals || 0);

  if (playerGoals > opponentGoals) return "win";
  if (playerGoals < opponentGoals) return "loss";
  return "draw";
}

function deriveDisplayResult(stat?: PlayerStatDraft) {
  const result = deriveResult(stat);
  if (result === "win") return "Win";
  if (result === "loss") return "Loss";
  return "Draw";
}

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  hint,
  readOnly = false
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  hint?: string;
  readOnly?: boolean;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm text-[color:var(--text-muted)]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-[#00D4FF]/30 ${readOnly ? "cursor-default opacity-80" : ""}`}
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
