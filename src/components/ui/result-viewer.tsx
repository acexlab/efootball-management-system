"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { CalendarDays, MapPin, Trophy } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type ResultSlot = {
  slotNumber: number;
  playerName: string;
  playerGoals: number;
  opponentName: string;
  opponentGoals: number;
  result: string;
};

type ResultDetail = {
  tournamentName: string;
  matchNumber: number;
  clubName: string;
  opponentTeam: string;
  venue: string;
  scheduledAt: string;
  remarks: string;
  walkover: boolean;
  clubPoints: number;
  opponentPoints: number;
  slots: ResultSlot[];
};

export function ResultViewer() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ResultDetail | null>(null);

  const tournamentId = searchParams.get("tournament") ?? "";
  const matchNumber = searchParams.get("match") ?? "";

  const loadResult = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !tournamentId || !matchNumber) {
      setResult(null);
      setLoading(false);
      setMessage("Choose a valid saved match result.");
      return;
    }

    setLoading(true);
    setMessage("");

    const [{ data: matchRow, error: matchError }, { data: tournamentRow, error: tournamentError }] = await Promise.all([
      supabase
        .from("matches")
        .select("id, match_number, scheduled_at, venue, opponent_team, walkover, remarks, home_score, away_score")
        .eq("tournament_id", tournamentId)
        .eq("match_number", Number(matchNumber) || 1)
        .maybeSingle(),
      supabase.from("tournaments").select("name, home_team_name").eq("id", tournamentId).maybeSingle()
    ]);

    if (matchError || tournamentError) {
      setResult(null);
      setLoading(false);
      setMessage(`Saved result could not be loaded: ${matchError?.message ?? tournamentError?.message ?? "Unknown error"}`);
      return;
    }

    if (!matchRow) {
      setResult(null);
      setLoading(false);
      setMessage("No saved result was found for this match.");
      return;
    }

    const [{ data: slotRows, error: slotError }, { data: statRows, error: statError }, { data: profileRows, error: profileError }] =
      await Promise.all([
        supabase.from("match_slots").select("slot_number, player_id").eq("match_id", matchRow.id).order("slot_number", { ascending: true }),
        supabase
          .from("match_stats")
          .select("player_id, goals, opponent_name, opponent_goals, result")
          .eq("match_id", matchRow.id),
        supabase.from("profiles").select("id, full_name, gamer_tag")
      ]);

    if (slotError || statError || profileError) {
      setResult(null);
      setLoading(false);
      setMessage(`Result details could not be loaded: ${slotError?.message ?? statError?.message ?? profileError?.message ?? "Unknown error"}`);
      return;
    }

    const profileMap = new Map(
      (profileRows ?? []).map((row) => [row.id, row.gamer_tag || row.full_name || "Player"])
    );
    const statsMap = new Map(
      (statRows ?? []).map((row) => [
        row.player_id,
        {
          goals: Number(row.goals ?? 0),
          opponentName: row.opponent_name ?? "Opponent",
          opponentGoals: Number((row as { opponent_goals?: number | null }).opponent_goals ?? 0),
          result: String(row.result ?? "draw")
        }
      ])
    );

    const slots = (slotRows ?? []).map((row) => {
      const stats = statsMap.get(row.player_id);
      return {
        slotNumber: Number(row.slot_number ?? 0),
        playerName: profileMap.get(row.player_id) ?? "Player",
        playerGoals: stats?.goals ?? 0,
        opponentName: stats?.opponentName ?? "Opponent",
        opponentGoals: stats?.opponentGoals ?? 0,
        result: normalizeResult(stats?.result)
      };
    });

    const clubPoints = slots.reduce((sum, slot) => {
      if (slot.result === "Win") return sum + 3;
      if (slot.result === "Draw") return sum + 1;
      return sum;
    }, 0);
    const opponentPoints = slots.reduce((sum, slot) => {
      if (slot.result === "Loss") return sum + 3;
      if (slot.result === "Draw") return sum + 1;
      return sum;
    }, 0);

    setResult({
      tournamentName: tournamentRow?.name ?? "Tournament",
      matchNumber: Number(matchRow.match_number ?? matchNumber ?? 1),
      clubName: tournamentRow?.home_team_name ?? "Shield Entity",
      opponentTeam: matchRow.opponent_team ?? "Opponent Team",
      venue: matchRow.venue ?? "Shield Arena",
      scheduledAt: matchRow.scheduled_at ? new Date(matchRow.scheduled_at).toLocaleString() : "Not scheduled",
      remarks: matchRow.remarks ?? "",
      walkover: Boolean(matchRow.walkover),
      clubPoints,
      opponentPoints,
      slots
    });
    setLoading(false);
  }, [matchNumber, tournamentId]);

  const syncViewer = useEffectEvent(() => {
    void loadResult();
  });

  useEffect(() => {
    syncViewer();
  }, [matchNumber, tournamentId]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-[color:var(--text-muted)]">
        Loading saved result...
      </div>
    );
  }

  if (!result) {
    return <EmptyState icon={Trophy} title="No result to show" description={message || "Open this page from a saved match result."} />;
  }

  return (
    <div className="space-y-4">
      {message ? (
        <div className="rounded-2xl border border-[#00D4FF]/20 bg-[#00D4FF]/10 px-4 py-3 text-sm text-[#C5F5FF]">
          {message}
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
              {result.tournamentName} • Match {result.matchNumber}
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white">
              {result.clubName} vs {result.opponentTeam}
            </h3>
          </div>
          <StatusPill label={result.walkover ? "Walkover" : "Completed"} tone={result.walkover ? "warning" : "success"} />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
          <div>
            <p className="text-xs text-[color:var(--text-muted)]">Home</p>
            <p className="mt-1 text-lg font-semibold text-white">{result.clubName}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 text-center">
            <p className="text-2xl font-black tracking-[0.14em] text-white" style={{ fontFamily: "\"Orbitron\", sans-serif" }}>
              {result.clubPoints} : {result.opponentPoints}
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-[color:var(--text-muted)]">Points</p>
          </div>
          <div className="md:text-right">
            <p className="text-xs text-[color:var(--text-muted)]">Away</p>
            <p className="mt-1 text-lg font-semibold text-white">{result.opponentTeam}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-[color:var(--text-muted)]">
          <Meta icon={CalendarDays} text={result.scheduledAt} />
          <Meta icon={MapPin} text={result.venue} />
        </div>
      </div>

      <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
        <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--text-muted)]">Player Results</p>
        <div className="mt-4 grid gap-3">
          {result.slots.map((slot) => (
            <div key={`${slot.slotNumber}-${slot.playerName}`} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[1fr_auto_1fr_auto] lg:items-center">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">Shield Player</p>
                  <p className="mt-1 text-base font-semibold text-white">{slot.playerName}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-center">
                  <p className="text-lg font-bold text-white">{slot.playerGoals} : {slot.opponentGoals}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">Opponent</p>
                  <p className="mt-1 text-base font-semibold text-white">{slot.opponentName}</p>
                </div>
                <div className="lg:justify-self-end">
                  <StatusPill label={slot.result} tone={slot.result === "Win" ? "success" : slot.result === "Loss" ? "danger" : "info"} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {result.remarks ? (
        <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--text-muted)]">Remarks</p>
          <p className="mt-3 whitespace-pre-wrap text-sm text-white">{result.remarks}</p>
        </div>
      ) : null}
    </div>
  );
}

function normalizeResult(result?: string) {
  if (result === "win") return "Win";
  if (result === "loss") return "Loss";
  return "Draw";
}

function Meta({
  icon: Icon,
  text
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5">
      <Icon className="h-3.5 w-3.5 flex-shrink-0 text-[#00D4FF]" />
      <span className="truncate">{text}</span>
    </span>
  );
}
