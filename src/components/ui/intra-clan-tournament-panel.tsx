"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, GitBranchPlus, Trophy, Users } from "lucide-react";
import { CreateTournamentModal, type NewTournament } from "@/components/ui/create-tournament-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusPill } from "@/components/ui/status-pill";
import type { PlayerOption, Tournament } from "@/lib/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type FixtureCard = {
  id: string;
  matchNumber: number;
  stageLabel: string;
  groupName: string;
  homePlayerId: string;
  awayPlayerId: string;
  homePlayerName: string;
  awayPlayerName: string;
  status: string;
  scheduledAt: string | null;
  venue: string | null;
  homeScore: number | null;
  awayScore: number | null;
  stageType: "league" | "pool" | "knockout";
  knockoutRoundOrder: number;
};

type PoolTableRow = {
  playerId: string;
  playerName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  rank: number;
};

type PlayerStatRow = { playerId: string; playerName: string; goals: number; wins: number; conceded: number };
type KnockoutQualifier = { playerId: string; playerName: string; poolName: string; rank: number; points: number; goalDifference: number; goalsFor: number };

export function IntraClanTournamentPanel({
  tournaments,
  playerOptions,
  canManageAll,
  manageableTournamentIds,
  onCreate,
  onDelete,
  deletingTournamentId
}: {
  tournaments: Tournament[];
  playerOptions: PlayerOption[];
  canManageAll: boolean;
  manageableTournamentIds: string[];
  onCreate: (tournament: NewTournament) => void | Promise<void>;
  onDelete: (tournament: Tournament) => void | Promise<void>;
  deletingTournamentId?: string | null;
}) {
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [view, setView] = useState<"overview" | "fixtures" | "results" | "stats">("overview");
  const [fixtures, setFixtures] = useState<FixtureCard[]>([]);
  const [poolTables, setPoolTables] = useState<Record<string, PoolTableRow[]>>({});
  const [playerStats, setPlayerStats] = useState<PlayerStatRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [draftScores, setDraftScores] = useState<Record<string, { home: string; away: string }>>({});
  const [savingMatchId, setSavingMatchId] = useState<string | null>(null);
  const [generatingKnockout, setGeneratingKnockout] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const selectedTournament = tournaments.find((t) => t.id === selectedTournamentId) ?? null;
  const canManageSelectedTournament = !!selectedTournamentId && (canManageAll || manageableTournamentIds.includes(selectedTournamentId));
  const playerNameMap = useMemo(() => Object.fromEntries(playerOptions.map((p) => [p.id, p.name])), [playerOptions]);

  const loadTournamentDetails = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !selectedTournamentId) {
      setFixtures([]);
      setPoolTables({});
      setPlayerStats([]);
      return;
    }
    setLoading(true);
    setMessage("");
    const [{ data: matchRows, error: matchError }, { data: teamRows, error: teamError }] = await Promise.all([
      supabase.from("matches").select("id, match_number, home_player_id, away_player_id, status, scheduled_at, venue, home_score, away_score").eq("tournament_id", selectedTournamentId).order("match_number", { ascending: true }),
      supabase.from("tournament_teams").select("id, name, team_players(player_id)").eq("tournament_id", selectedTournamentId).order("created_at", { ascending: true })
    ]);
    if (matchError || teamError) {
      setMessage(`Intra clan tournament data could not be loaded: ${matchError?.message ?? teamError?.message ?? "Unknown error"}`);
      setLoading(false);
      return;
    }

    const poolByPlayer = new Map<string, string>();
    const playersByGroup = new Map<string, string[]>();
    for (const team of (teamRows ?? []) as Array<{ id: string; name: string; team_players: Array<{ player_id: string }> | null }>) {
      const ids = (team.team_players ?? []).map((row) => row.player_id);
      playersByGroup.set(team.name, ids);
      ids.forEach((id) => poolByPlayer.set(id, team.name));
    }

    const nextFixtures = ((matchRows ?? []) as Array<{ id: string; match_number: number | null; home_player_id: string | null; away_player_id: string | null; status: string | null; scheduled_at: string | null; venue: string | null; home_score: number | null; away_score: number | null }>)
      .filter((m) => m.home_player_id && m.away_player_id)
      .map((m) => mapFixture(m, playerNameMap, poolByPlayer));

    setFixtures(nextFixtures);
    setDraftScores(Object.fromEntries(nextFixtures.map((f) => [f.id, { home: String(f.homeScore ?? 0), away: String(f.awayScore ?? 0) }])));

    const tableFixtures = nextFixtures.filter((f) => f.stageType !== "knockout");
    const completedTableFixtures = tableFixtures.filter((f) => f.status === "Completed" && f.homeScore !== null && f.awayScore !== null);
    const nextTables: Record<string, PoolTableRow[]> = {};
    const statMap = new Map<string, PlayerStatRow>();

    for (const [groupName, ids] of playersByGroup.entries()) {
      const rows = new Map<string, PoolTableRow>();
      ids.forEach((id) => {
        const playerName = playerNameMap[id] ?? "Player";
        rows.set(id, { playerId: id, playerName, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, rank: 0 });
        if (!statMap.has(id)) statMap.set(id, { playerId: id, playerName, goals: 0, wins: 0, conceded: 0 });
      });
      completedTableFixtures.filter((f) => f.groupName === groupName).forEach((f) => applyFixtureToTable(f, rows, statMap));
      nextTables[groupName] = [...rows.values()].sort(sortTableRows).map((row, index) => ({ ...row, rank: index + 1 }));
    }

    setPoolTables(nextTables);
    setPlayerStats([...statMap.values()].sort((a, b) => b.goals - a.goals || b.wins - a.wins || a.conceded - b.conceded || a.playerName.localeCompare(b.playerName)));
    setLoading(false);
  }, [playerNameMap, selectedTournamentId]);

  useEffect(() => {
    if (!selectedTournamentId && tournaments.length) {
      setSelectedTournamentId(tournaments[0].id);
      return;
    }
    void loadTournamentDetails();
  }, [loadTournamentDetails, selectedTournamentId, tournaments]);

  const poolFixtures = fixtures.filter((f) => f.stageType !== "knockout");
  const knockoutFixtures = fixtures.filter((f) => f.stageType === "knockout").sort((a, b) => a.knockoutRoundOrder - b.knockoutRoundOrder || a.matchNumber - b.matchNumber);
  const completedFixtures = fixtures.filter((f) => f.status === "Completed").length;
  const completedPoolFixtures = poolFixtures.filter((f) => f.status === "Completed").length;
  const allPoolFixturesCompleted = poolFixtures.length > 0 && poolFixtures.every((f) => f.status === "Completed");
  const topScorer = playerStats[0] ?? null;
  const bestWinner = [...playerStats].sort((a, b) => b.wins - a.wins || b.goals - a.goals)[0] ?? null;
  const leastConceded = [...playerStats].sort((a, b) => a.conceded - b.conceded || b.wins - a.wins)[0] ?? null;
  const qualifiersPerPool = useMemo(() => getQualifierCapPerPool(selectedTournament?.players ?? 0), [selectedTournament?.players]);
  const knockoutQualifiers = useMemo(() => getKnockoutQualifiers(poolTables, selectedTournament?.players ?? 0), [poolTables, selectedTournament?.players]);
  const champion = useMemo(() => {
    const final = knockoutFixtures.find((f) => f.stageLabel === "Final" && f.status === "Completed" && f.homeScore !== null && f.awayScore !== null && f.homeScore !== f.awayScore);
    if (!final) return null;
    return (final.homeScore ?? 0) > (final.awayScore ?? 0) ? final.homePlayerName : final.awayPlayerName;
  }, [knockoutFixtures]);
  const canGenerateKnockout = selectedTournament?.formatMode === "group_knockout" && canManageSelectedTournament && allPoolFixturesCompleted && knockoutQualifiers.length >= 2 && knockoutFixtures.length === 0;

  async function handleSaveFixture(fixture: FixtureCard) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !canManageSelectedTournament) return;
    const draft = draftScores[fixture.id] ?? { home: "0", away: "0" };
    const homeScore = Number(draft.home);
    const awayScore = Number(draft.away);
    if (Number.isNaN(homeScore) || Number.isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
      setMessage("Enter valid non-negative scores before saving the fixture result.");
      return;
    }
    if (fixture.stageType === "knockout" && homeScore === awayScore) {
      setMessage("Knockout matches cannot end in a draw. Enter a winner.");
      return;
    }
    setSavingMatchId(fixture.id);
    setMessage("");
    const saveError = await saveMatchArtifacts(fixture, homeScore, awayScore);
    if (saveError) {
      setMessage(saveError);
      setSavingMatchId(null);
      return;
    }
    setSavingMatchId(null);
    await loadTournamentDetails();
    if (fixture.stageType === "knockout") {
      await maybeAdvanceKnockoutBracket();
    } else {
      setMessage("Intra clan fixture result saved.");
    }
  }

  async function handleGenerateKnockout() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !selectedTournamentId || !canGenerateKnockout) return;
    setGeneratingKnockout(true);
    setMessage("");
    const nextMatchNumber = fixtures.length ? Math.max(...fixtures.map((f) => f.matchNumber)) + 1 : 1;
    const roundLabel = getRoundLabelForEntrants(knockoutQualifiers.length);
    const openingFixtures = buildKnockoutFixtures(knockoutQualifiers.map((q) => q.playerId), roundLabel, nextMatchNumber, playerNameMap);
    const { error } = await supabase.from("matches").insert(openingFixtures.map((f) => ({ tournament_id: selectedTournamentId, match_number: f.matchNumber, home_player_id: f.homePlayerId, away_player_id: f.awayPlayerId, opponent_team: f.awayPlayerName, scheduled_at: null, venue: f.venue, status: "Upcoming", lineup_locked: false })));
    if (error) {
      setMessage(`Knockout bracket could not be generated: ${error.message}`);
      setGeneratingKnockout(false);
      return;
    }
    setGeneratingKnockout(false);
    setMessage(`${roundLabel} fixtures generated from the top pool finishers.`);
    await loadTournamentDetails();
  }

  async function saveMatchArtifacts(fixture: FixtureCard, homeScore: number, awayScore: number) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return "Project configuration is missing.";
    const { error: matchError } = await supabase.from("matches").update({ home_score: homeScore, away_score: awayScore, status: "Completed", lineup_locked: true, scheduled_at: fixture.scheduledAt ?? new Date().toISOString(), venue: fixture.venue ?? fixture.stageLabel }).eq("id", fixture.id);
    if (matchError) return `Fixture result could not be saved: ${matchError.message}`;
    await supabase.from("match_slots").delete().eq("match_id", fixture.id);
    await supabase.from("match_stats").delete().eq("match_id", fixture.id);
    const { error: slotsError } = await supabase.from("match_slots").insert([{ match_id: fixture.id, slot_number: 1, player_id: fixture.homePlayerId }, { match_id: fixture.id, slot_number: 2, player_id: fixture.awayPlayerId }]);
    if (slotsError) return `Fixture slots could not be saved: ${slotsError.message}`;
    const { error: statsError } = await supabase.from("match_stats").insert([{ match_id: fixture.id, player_id: fixture.homePlayerId, goals: homeScore, opponent_goals: awayScore, result: getMatchResult(homeScore, awayScore), opponent_name: fixture.awayPlayerName }, { match_id: fixture.id, player_id: fixture.awayPlayerId, goals: awayScore, opponent_goals: homeScore, result: getMatchResult(awayScore, homeScore), opponent_name: fixture.homePlayerName }]);
    if (statsError) return `Fixture stats could not be saved: ${statsError.message}`;
    return null;
  }

  async function maybeAdvanceKnockoutBracket() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !selectedTournamentId) return;
    const stageMap = new Map<string, FixtureCard[]>();
    knockoutFixtures.forEach((fixture) => {
      if (!stageMap.has(fixture.stageLabel)) stageMap.set(fixture.stageLabel, []);
      stageMap.get(fixture.stageLabel)?.push(fixture);
    });
    const stages = [...stageMap.keys()].sort((a, b) => getKnockoutRoundOrder(a) - getKnockoutRoundOrder(b));
    for (const stageLabel of stages) {
      const stageFixtures = stageMap.get(stageLabel) ?? [];
      const complete = stageFixtures.every((f) => f.status === "Completed" && f.homeScore !== null && f.awayScore !== null && f.homeScore !== f.awayScore);
      if (!complete) continue;
      const winners = stageFixtures.map((f) => ((f.homeScore ?? 0) > (f.awayScore ?? 0) ? { id: f.homePlayerId, name: f.homePlayerName } : { id: f.awayPlayerId, name: f.awayPlayerName }));
      if (winners.length === 1) {
        setMessage(`Champion decided: ${winners[0].name}`);
        return;
      }
      const nextStage = getRoundLabelForEntrants(winners.length);
      if (knockoutFixtures.some((f) => f.stageLabel === nextStage)) continue;
      const nextMatchNumber = fixtures.length ? Math.max(...fixtures.map((f) => f.matchNumber)) + 1 : 1;
      const nextFixtures = buildKnockoutFixtures(winners.map((w) => w.id), nextStage, nextMatchNumber, playerNameMap);
      const { error } = await supabase.from("matches").insert(nextFixtures.map((f) => ({ tournament_id: selectedTournamentId, match_number: f.matchNumber, home_player_id: f.homePlayerId, away_player_id: f.awayPlayerId, opponent_team: f.awayPlayerName, scheduled_at: null, venue: f.venue, status: "Upcoming", lineup_locked: false })));
      if (error) {
        setMessage(`Next knockout round could not be generated: ${error.message}`);
        return;
      }
      setMessage(`${nextStage} fixtures generated.`);
      await loadTournamentDetails();
      return;
    }
  }

  const knockoutPreview = useMemo(() => {
    if (selectedTournament?.formatMode !== "group_knockout") return [];
    return knockoutQualifiers.map((q) => `${q.poolName} #${q.rank} • ${q.playerName}`);
  }, [knockoutQualifiers, selectedTournament?.formatMode]);

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <Panel className="p-4 sm:p-5"><SectionHeading eyebrow="Intra Clan" title="Tournament Hub" description="Create player-only competitions, turn pool standings into elimination rounds, and decide a winner." /><div className="mt-4 space-y-2">{(["overview", "fixtures", "results", "stats"] as const).map((item) => <button key={item} type="button" onClick={() => setView(item)} className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold ${view === item ? "border-[#00FF88]/30 bg-[#00FF88]/10 text-[#00FF88]" : "border-white/8 bg-white/[0.03] text-white"}`}>{item === "overview" ? "Overview" : item === "fixtures" ? "Fixtures" : item === "results" ? "Tables" : "Stats"}</button>)}</div></Panel>
      <div className="space-y-4">
        <Panel className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <SelectField label="Intra clan tournament" value={selectedTournamentId} onChange={setSelectedTournamentId} options={tournaments.map((t) => ({ label: t.name, value: t.id }))} placeholder={tournaments.length ? "Select intra clan tournament" : "No intra clan tournaments"} />
              <div className="flex flex-wrap gap-2">
                <StatusPill label={`${fixtures.length} fixtures`} tone="info" />
                <StatusPill label={`${completedFixtures} completed`} tone="success" />
                <StatusPill label={selectedTournament?.format ?? "No format"} tone="neutral" />
                {champion ? <StatusPill label={`Winner: ${champion}`} tone="success" /> : null}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {canGenerateKnockout ? <button type="button" onClick={() => void handleGenerateKnockout()} disabled={generatingKnockout} className="rounded-2xl border border-[#00D4FF]/30 bg-[#00D4FF]/10 px-4 py-3 text-sm font-semibold text-[#8BE8FF] disabled:cursor-not-allowed disabled:opacity-60">{generatingKnockout ? "Generating..." : "Generate Knockout"}</button> : null}
              {canManageAll && selectedTournament ? <button type="button" onClick={() => void onDelete(selectedTournament)} disabled={deletingTournamentId === selectedTournament.id} className="rounded-2xl border border-[#FF5470]/30 bg-[#FF5470]/10 px-4 py-3 text-sm font-semibold text-[#FF9BAC] disabled:cursor-not-allowed disabled:opacity-60">{deletingTournamentId === selectedTournament.id ? "Deleting..." : "Delete Tournament"}</button> : null}
              <button type="button" onClick={() => setCreateOpen((s) => !s)} className="rounded-2xl border border-[#00FF88]/30 bg-[#00FF88]/10 px-4 py-3 text-sm font-semibold text-[#00FF88]">{createOpen ? "Close Creator" : "Create Intra Clan Tournament"}</button>
            </div>
          </div>
          {message ? <div className="mt-4 rounded-xl border border-[#00D4FF]/20 bg-[#00D4FF]/10 px-3 py-2 text-sm text-[#C5F5FF]">{message}</div> : null}
        </Panel>
        {!tournaments.length ? (
          <Panel className="p-4 sm:p-5"><EmptyState icon={Users} title="No intra clan tournaments yet" description="Create an intra clan knockout, league, or group + knockout tournament to start." /></Panel>
        ) : loading ? (
          <Panel className="p-4 sm:p-5"><div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-4 text-sm text-[color:var(--text-muted)]">Loading intra clan data...</div></Panel>
        ) : (
          <>
            {view === "overview" ? (
              <div className="grid gap-4 xl:grid-cols-3">
                <MetricCard icon={GitBranchPlus} label="Groups" value={String(Object.keys(poolTables).length || 1)} />
                <MetricCard icon={CalendarDays} label="Pool Results" value={`${completedPoolFixtures}/${poolFixtures.length}`} />
                <MetricCard icon={BarChart3} label="Knockout Matches" value={String(knockoutFixtures.length)} />
                <Panel className="xl:col-span-3 p-4 sm:p-5">
                  <SectionHeading eyebrow="Qualification" title="Knockout Feed" description={selectedTournament?.formatMode === "group_knockout" ? `Top ${qualifiersPerPool} from each pool are considered, then the best bracket-sized field advances into elimination until a winner is decided.` : "Knockout details appear here for group + knockout tournaments."} />
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {knockoutPreview.length ? knockoutPreview.map((item) => <div key={item} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-4 text-sm text-white">{item}</div>) : <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-4 text-sm text-[color:var(--text-muted)] md:col-span-2 xl:col-span-4">{selectedTournament?.formatMode === "group_knockout" ? "Complete all pool matches to prepare qualifiers for the knockout stage." : "This tournament mode does not use pool-to-knockout qualification."}</div>}
                  </div>
                </Panel>
                {knockoutFixtures.length ? <Panel className="xl:col-span-3 p-4 sm:p-5"><SectionHeading eyebrow="Bracket" title="Knockout Progress" description="Each knockout match is single elimination. Winners advance until the final decides the champion." /><div className="mt-4 grid gap-3">{knockoutFixtures.map((fixture) => <div key={fixture.id} className="rounded-2xl border border-white/8 bg-black/20 p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm font-semibold text-white">{fixture.stageLabel}</p><StatusPill label={fixture.status} tone={fixture.status === "Completed" ? "success" : "info"} /></div><p className="mt-2 text-sm text-[color:var(--text-muted)]">{fixture.homePlayerName} vs {fixture.awayPlayerName}</p></div>)}</div></Panel> : null}
              </div>
            ) : null}
            {view === "fixtures" ? (
              <div className="grid gap-3">
                {fixtures.length ? fixtures.map((fixture) => <Panel key={fixture.id} className="p-4"><div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><div><p className="text-xs uppercase tracking-[0.22em] text-[color:var(--text-muted)]">{fixture.stageLabel} • Match {fixture.matchNumber}</p><p className="mt-2 text-base font-semibold text-white">{fixture.homePlayerName} vs {fixture.awayPlayerName}</p></div><div className="flex flex-wrap gap-2"><StatusPill label={fixture.status} tone={fixture.status === "Completed" ? "success" : "info"} /><StatusPill label={fixture.stageType === "knockout" ? "Elimination" : fixture.groupName} tone="neutral" /></div></div><div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_120px_120px_auto]"><ScoreField label={`${fixture.homePlayerName} goals`} value={draftScores[fixture.id]?.home ?? "0"} onChange={(value) => setDraftScores((state) => ({ ...state, [fixture.id]: { home: value, away: state[fixture.id]?.away ?? "0" } }))} /><ScoreField label={`${fixture.awayPlayerName} goals`} value={draftScores[fixture.id]?.away ?? "0"} onChange={(value) => setDraftScores((state) => ({ ...state, [fixture.id]: { home: state[fixture.id]?.home ?? "0", away: value } }))} /><div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-[color:var(--text-muted)]">{fixture.scheduledAt ? new Date(fixture.scheduledAt).toLocaleString() : "Not scheduled"}</div><button type="button" onClick={() => void handleSaveFixture(fixture)} disabled={!canManageSelectedTournament || savingMatchId === fixture.id} className="rounded-2xl border border-[#00FF88]/30 bg-[#00FF88]/10 px-4 py-3 text-sm font-semibold text-[#00FF88] disabled:cursor-not-allowed disabled:opacity-60">{savingMatchId === fixture.id ? "Saving..." : fixture.status === "Completed" ? "Update Result" : "Save Result"}</button></div></Panel>) : <Panel className="p-4 sm:p-5"><EmptyState icon={GitBranchPlus} title="No fixtures generated" description="Create an intra clan tournament and fixtures will appear here." /></Panel>}
              </div>
            ) : null}
            {view === "results" ? (
              <div className="grid gap-4">
                {Object.keys(poolTables).length ? Object.entries(poolTables).map(([groupName, rows]) => <Panel key={groupName} className="overflow-hidden p-0"><div className="border-b border-white/8 px-4 py-4 sm:px-5"><SectionHeading eyebrow={groupName.toLowerCase().includes("pool") ? "Pool Table" : "League Table"} title={groupName} description="Live standings calculated from completed fixtures." /></div><div className="overflow-x-auto px-4 py-4 sm:px-5"><table className="min-w-full text-left text-sm"><thead className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]"><tr><th className="pb-3 pr-4">#</th><th className="pb-3 pr-4">Player</th><th className="pb-3 pr-4">P</th><th className="pb-3 pr-4">W</th><th className="pb-3 pr-4">D</th><th className="pb-3 pr-4">L</th><th className="pb-3 pr-4">GF</th><th className="pb-3 pr-4">GA</th><th className="pb-3 pr-4">GD</th><th className="pb-3">Pts</th></tr></thead><tbody>{rows.map((row) => <tr key={`${groupName}-${row.playerId}`} className="border-t border-white/6 text-white"><td className="py-3 pr-4">{row.rank}</td><td className="py-3 pr-4 font-semibold">{row.playerName}</td><td className="py-3 pr-4">{row.played}</td><td className="py-3 pr-4">{row.wins}</td><td className="py-3 pr-4">{row.draws}</td><td className="py-3 pr-4">{row.losses}</td><td className="py-3 pr-4">{row.goalsFor}</td><td className="py-3 pr-4">{row.goalsAgainst}</td><td className="py-3 pr-4">{row.goalDifference}</td><td className="py-3 font-semibold text-[#00FF88]">{row.points}</td></tr>)}</tbody></table></div></Panel>) : <Panel className="p-4 sm:p-5"><EmptyState icon={Trophy} title="Results are empty" description="Save fixture results to build the tables and decide qualifiers." /></Panel>}
              </div>
            ) : null}
            {view === "stats" ? (
              <div className="grid gap-4 xl:grid-cols-3">
                <MetricCard icon={Trophy} label="Most Goals" value={topScorer ? `${topScorer.playerName} (${topScorer.goals})` : "No data"} />
                <MetricCard icon={BarChart3} label="Most Wins" value={bestWinner ? `${bestWinner.playerName} (${bestWinner.wins})` : "No data"} />
                <MetricCard icon={Users} label="Least Conceded" value={leastConceded ? `${leastConceded.playerName} (${leastConceded.conceded})` : "No data"} />
                <Panel className="xl:col-span-3 p-4 sm:p-5"><SectionHeading eyebrow="Player Stats" title="Intra Clan Leaders" description="Goals, wins, and conceded totals across completed intra clan fixtures." /><div className="mt-4 grid gap-3">{playerStats.length ? playerStats.map((row) => <div key={row.playerId} className="grid gap-3 rounded-2xl border border-white/8 bg-black/20 p-4 md:grid-cols-4"><div className="font-semibold text-white">{row.playerName}</div><div className="text-sm text-[color:var(--text-muted)]">Goals: <span className="text-white">{row.goals}</span></div><div className="text-sm text-[color:var(--text-muted)]">Wins: <span className="text-white">{row.wins}</span></div><div className="text-sm text-[color:var(--text-muted)]">Conceded: <span className="text-white">{row.conceded}</span></div></div>) : <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-4 text-sm text-[color:var(--text-muted)]">Save a few fixture results to populate player stats.</div>}</div></Panel>
              </div>
            ) : null}
          </>
        )}
      </div>
      <CreateTournamentModal open={createOpen} onClose={() => setCreateOpen(false)} onCreate={(tournament) => void onCreate(tournament)} playerOptions={playerOptions} defaultScope="intra_clan" />
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <Panel className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--text-muted)]">{label}</p>
          <p className="mt-3 text-lg font-semibold text-white">{value}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"><Icon className="h-5 w-5 text-[#00D4FF]" /></div>
      </div>
    </Panel>
  );
}

function SelectField({ label, value, onChange, options, placeholder }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ label: string; value: string }>; placeholder: string }) {
  return (
    <label className="space-y-2">
      <span className="text-sm text-[color:var(--text-muted)]">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-[#00D4FF]/30">
        <option value="">{placeholder}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function ScoreField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-2">
      <span className="text-sm text-[color:var(--text-muted)]">{label}</span>
      <input type="number" min="0" value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-[#00D4FF]/30" />
    </label>
  );
}

function getMatchResult(homeScore: number, awayScore: number) {
  if (homeScore > awayScore) return "win";
  if (homeScore < awayScore) return "loss";
  return "draw";
}

function mapFixture(match: { id: string; match_number: number | null; home_player_id: string | null; away_player_id: string | null; status: string | null; scheduled_at: string | null; venue: string | null; home_score: number | null; away_score: number | null }, playerNameMap: Record<string, string>, poolByPlayer: Map<string, string>): FixtureCard {
  const knockoutRound = getKnockoutRoundFromVenue(match.venue);
  const stageType: FixtureCard["stageType"] = knockoutRound ? "knockout" : (match.venue ?? "").toLowerCase().includes("pool") ? "pool" : "league";
  const groupName = stageType === "knockout" ? "Knockout" : poolByPlayer.get(match.home_player_id ?? "") ?? match.venue ?? "League Stage";
  return { id: match.id, matchNumber: match.match_number ?? 1, stageLabel: knockoutRound ?? groupName, groupName, homePlayerId: match.home_player_id ?? "", awayPlayerId: match.away_player_id ?? "", homePlayerName: playerNameMap[match.home_player_id ?? ""] ?? "Player", awayPlayerName: playerNameMap[match.away_player_id ?? ""] ?? "Player", status: match.status ?? "Upcoming", scheduledAt: match.scheduled_at, venue: match.venue, homeScore: match.home_score, awayScore: match.away_score, stageType, knockoutRoundOrder: getKnockoutRoundOrder(knockoutRound) };
}

function applyFixtureToTable(fixture: FixtureCard, rows: Map<string, PoolTableRow>, statMap: Map<string, PlayerStatRow>) {
  const home = rows.get(fixture.homePlayerId);
  const away = rows.get(fixture.awayPlayerId);
  if (!home || !away || fixture.homeScore === null || fixture.awayScore === null) return;
  home.played += 1; away.played += 1; home.goalsFor += fixture.homeScore; home.goalsAgainst += fixture.awayScore; away.goalsFor += fixture.awayScore; away.goalsAgainst += fixture.homeScore; home.goalDifference = home.goalsFor - home.goalsAgainst; away.goalDifference = away.goalsFor - away.goalsAgainst;
  const homeStat = statMap.get(fixture.homePlayerId); const awayStat = statMap.get(fixture.awayPlayerId);
  if (homeStat && awayStat) { homeStat.goals += fixture.homeScore; awayStat.goals += fixture.awayScore; homeStat.conceded += fixture.awayScore; awayStat.conceded += fixture.homeScore; }
  if (fixture.homeScore > fixture.awayScore) { home.wins += 1; away.losses += 1; home.points += 3; if (homeStat) homeStat.wins += 1; }
  else if (fixture.homeScore < fixture.awayScore) { away.wins += 1; home.losses += 1; away.points += 3; if (awayStat) awayStat.wins += 1; }
  else { home.draws += 1; away.draws += 1; home.points += 1; away.points += 1; }
}

function sortTableRows(a: PoolTableRow, b: PoolTableRow) {
  return b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.playerName.localeCompare(b.playerName);
}

function getKnockoutRoundFromVenue(venue: string | null | undefined) {
  if (!venue?.startsWith("Knockout:")) return null;
  return venue.replace("Knockout:", "").trim();
}

function getKnockoutRoundOrder(round: string | null) {
  if (round === "Round of 16") return 1;
  if (round === "Quarterfinal") return 2;
  if (round === "Semifinal") return 3;
  if (round === "Final") return 4;
  return 0;
}

function getRoundLabelForEntrants(entrantCount: number) {
  if (entrantCount <= 2) return "Final";
  if (entrantCount <= 4) return "Semifinal";
  if (entrantCount <= 8) return "Quarterfinal";
  return "Round of 16";
}

function getQualifierCapPerPool(totalParticipants: number) {
  if (totalParticipants >= 24) return 4;
  if (totalParticipants >= 16) return 3;
  if (totalParticipants >= 8) return 2;
  return 1;
}

function getTargetKnockoutSize(totalParticipants: number) {
  if (totalParticipants >= 16) return 8;
  if (totalParticipants >= 8) return 4;
  return 2;
}

function getKnockoutQualifiers(poolTables: Record<string, PoolTableRow[]>, totalParticipants: number) {
  const qualifiersPerPool = getQualifierCapPerPool(totalParticipants);
  const targetSize = getTargetKnockoutSize(totalParticipants);
  const orderedPoolNames = Object.keys(poolTables).sort((a, b) => a.localeCompare(b));
  const wave: KnockoutQualifier[] = [];
  for (let rank = 1; rank <= qualifiersPerPool; rank += 1) {
    for (const poolName of orderedPoolNames) {
      const row = poolTables[poolName]?.[rank - 1];
      if (!row) continue;
      wave.push({ playerId: row.playerId, playerName: row.playerName, poolName, rank: row.rank, points: row.points, goalDifference: row.goalDifference, goalsFor: row.goalsFor });
    }
  }
  return wave.sort((a, b) => a.rank - b.rank || b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.playerName.localeCompare(b.playerName)).slice(0, targetSize);
}

function buildKnockoutFixtures(playerIds: string[], roundLabel: string, startMatchNumber: number, playerNameMap: Record<string, string>) {
  const fixtures: Array<{ matchNumber: number; homePlayerId: string; awayPlayerId: string; homePlayerName: string; awayPlayerName: string; venue: string }> = [];
  for (let index = 0; index < playerIds.length; index += 2) {
    const homePlayerId = playerIds[index];
    const awayPlayerId = playerIds[index + 1];
    if (!homePlayerId || !awayPlayerId) continue;
    fixtures.push({ matchNumber: startMatchNumber + fixtures.length, homePlayerId, awayPlayerId, homePlayerName: playerNameMap[homePlayerId] ?? "Player", awayPlayerName: playerNameMap[awayPlayerId] ?? "Player", venue: `Knockout: ${roundLabel}` });
  }
  return fixtures;
}
