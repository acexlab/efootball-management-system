"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { loadNextTournamentMatchNumber } from "@/lib/matchday";
import { syncClubLeaderboardFromStats } from "@/lib/supabase/club-operations";
import { hasPermission } from "@/lib/rbac";
import type { MatchResult, PlayerOption, Role } from "@/lib/types";
import { useAuthProfile } from "@/hooks/use-auth-profile";

type TournamentOption = {
  id: string;
  name: string;
  slotCount: number;
};

type PlayerStatDraft = {
  goals: string;
  result: MatchResult;
};

export function ResultEntryForm({ role }: { role: Role }) {
  const { session, profile } = useAuthProfile();
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tournaments, setTournaments] = useState<TournamentOption[]>([]);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [matchNumber, setMatchNumber] = useState("1");
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
  const selectedTournament = tournaments.find((item) => item.id === selectedTournamentId) ?? null;
  const slotCount = selectedTournament?.slotCount ?? 0;

  const initializeLineupState = useCallback((nextSlotCount: number, nextPlayers: PlayerOption[]) => {
    const initialLineup = Array.from({ length: nextSlotCount }, (_, index) => nextPlayers[index]?.id ?? "");
    setLineup(initialLineup);
    setPlayerStats(
      Array.from({ length: nextSlotCount }, () => ({
        goals: "0",
        result: "Draw"
      }))
    );
    setOpponents(Array.from({ length: nextSlotCount }, () => ""));
  }, []);

  const loadSuggestedMatchNumber = useCallback(async (tournamentId: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !tournamentId) return;

    try {
      const nextMatchNumber = await loadNextTournamentMatchNumber(supabase, tournamentId);
      setMatchNumber(nextMatchNumber);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load match days.";
      setToast(`Match day suggestion could not be loaded: ${message}`);
    }
  }, []);

  const loadTournamentPlayers = useCallback(
    async (tournamentId: string, nextSlotCount: number) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;

      const { data: participantRows, error: participantsError } = await supabase
        .from("tournament_participants")
        .select("user_id")
        .eq("tournament_id", tournamentId);

      if (participantsError) {
        setPlayers([]);
        initializeLineupState(nextSlotCount, []);
        setToast(`Could not load tournament squad: ${participantsError.message}`);
        return;
      }

      const participantIds = (participantRows ?? []).map((item) => item.user_id);
      if (!participantIds.length) {
        setPlayers([]);
        initializeLineupState(nextSlotCount, []);
        return;
      }

      const { data: profileRows, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, gamer_tag, role, avatar_url")
        .in("id", participantIds);

      if (profilesError) {
        setPlayers([]);
        initializeLineupState(nextSlotCount, []);
        setToast(`Could not load player identities: ${profilesError.message}`);
        return;
      }

      const options: PlayerOption[] = (profileRows ?? []).map((item) => ({
        id: item.id,
        name: item.gamer_tag || item.full_name || "Shield Member",
        role: (item.role as Role | null) ?? "Player",
        avatarUrl: item.avatar_url ?? undefined
      }));

      setPlayers(options);
      initializeLineupState(nextSlotCount, options);
    },
    [initializeLineupState]
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

    const adminLike = role === "Super Admin" || role === "Admin";
    let tournamentRows:
      | Array<{ id: string; name: string; slot_count: number | null }>
      | null
      | undefined = [];
    let tournamentError: { message: string } | null = null;

    if (adminLike) {
      const response = await supabase
        .from("tournaments")
        .select("id, name, slot_count")
        .eq("lifecycle_state", "active")
        .order("created_at", { ascending: false });

      tournamentRows = response.data;
      tournamentError = response.error;
    } else {
      const { data: managedRows, error: managedError } = await supabase
        .from("tournament_participants")
        .select("tournament_id")
        .eq("user_id", session.user.id)
        .in("role", ["captain", "vice_captain"]);

      if (managedError) {
        tournamentError = managedError;
      } else {
        const tournamentIds = (managedRows ?? []).map((item) => item.tournament_id);
        if (tournamentIds.length) {
          const response = await supabase
            .from("tournaments")
            .select("id, name, slot_count")
            .in("id", tournamentIds)
            .eq("lifecycle_state", "active")
            .order("created_at", { ascending: false });

          tournamentRows = response.data;
          tournamentError = response.error;
        } else {
          tournamentRows = [];
        }
      }
    }

    if (tournamentError) {
      setToast(`Tournament access could not be loaded: ${tournamentError.message}`);
      setTournaments([]);
      setPlayers([]);
      setLoading(false);
      return;
    }

    const options = (tournamentRows ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      slotCount: item.slot_count ?? 5
    }));

    setTournaments(options);
    setLoading(false);

    if (options.length) {
      const nextTournamentId = options[0].id;
      setSelectedTournamentId(nextTournamentId);
      await loadSuggestedMatchNumber(nextTournamentId);
      await loadTournamentPlayers(nextTournamentId, options[0].slotCount);
    } else {
      setSelectedTournamentId("");
      setMatchNumber("1");
      setPlayers([]);
      initializeLineupState(0, []);
    }
  }, [initializeLineupState, loadSuggestedMatchNumber, loadTournamentPlayers, role, session]);

  const syncResultForm = useEffectEvent(() => {
    void loadAccessibleTournaments();
  });

  useEffect(() => {
    syncResultForm();
  }, [session, role]);

  const canSubmit = canSubmitByRole || tournaments.length > 0;

  const playerMap = useMemo(
    () => Object.fromEntries(players.map((player) => [player.id, player.name])),
    [players]
  );

  async function handleTournamentChange(tournamentId: string) {
    setSelectedTournamentId(tournamentId);
    const nextTournament = tournaments.find((item) => item.id === tournamentId);
    if (!nextTournament) {
      initializeLineupState(0, []);
      setMatchNumber("1");
      setPlayers([]);
      return;
    }

    await loadSuggestedMatchNumber(tournamentId);
    await loadTournamentPlayers(tournamentId, nextTournament.slotCount);
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
          home_score: Number(playerStats[0]?.goals || 0),
          away_score: Number(playerStats[1]?.goals || 0),
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
      result: (playerStats[index]?.result || "Draw").toLowerCase(),
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

    setToast("Match, final lineup, player stats, and leaderboard were saved.");
    setWalkover(false);
    setRemarks("");
    setOpponentTeam("");
    setStep(1);
    await loadSuggestedMatchNumber(selectedTournament.id);
    setSubmitting(false);
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-[color:var(--text-muted)]">
          Loading tournament access...
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
          onChange={setMatchNumber}
          placeholder="Auto"
          hint="Next open match day is suggested automatically."
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
            className="rounded-lg border border-[#00FF88]/30 bg-[#00FF88]/10 px-4 py-2 text-sm font-semibold text-[#00FF88] disabled:cursor-not-allowed disabled:opacity-60"
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
              Select the final players for each slot. Only these players will receive stats.
            </p>
          </div>
          <span className="rounded-full border border-[#00FF88]/20 bg-[#00FF88]/10 px-3 py-1 text-xs font-semibold text-[#00FF88]">
            {slotCount} slots
          </span>
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
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep(1)}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => setStep(3)}
            className="rounded-lg border border-[#00FF88]/30 bg-[#00FF88]/10 px-4 py-2 text-sm font-semibold text-[#00FF88]"
          >
            Next: Stats
          </button>
        </div>
      ) : null}

      <div className={`rounded-2xl border border-white/8 bg-black/20 p-4 ${step === 3 ? "" : "opacity-60"}`}>
        <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--text-muted)]">Player stats</p>
        <div className="mt-3 grid gap-3">
          {Array.from({ length: slotCount }).map((_, index) => (
            <div
              key={`stat-${index}`}
              className="grid gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-3 xl:grid-cols-[1.2fr_0.8fr_0.9fr_0.7fr]"
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
              <SelectField
                label="Result"
                value={playerStats[index]?.result ?? "Draw"}
                onChange={(value) => handleStatChange(index, { result: value as MatchResult })}
                options={[
                  { label: "Win", value: "Win" },
                  { label: "Draw", value: "Draw" },
                  { label: "Loss", value: "Loss" }
                ]}
                placeholder="Result"
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
        <div className="flex gap-2">
          {step === 3 ? (
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white"
            >
              Back
            </button>
          ) : null}
          <button
            type="submit"
            disabled={submitting || !selectedTournamentId || step !== 3}
            className="rounded-lg border border-[#00FF88]/30 bg-[#00FF88]/12 px-4 py-2 font-semibold text-[#00FF88] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Saving..." : "Save Match Result"}
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
