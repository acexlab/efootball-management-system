import type { SupabaseClient } from "@supabase/supabase-js";

export function getNextAvailableMatchNumber(existingNumbers: Array<number | null | undefined>) {
  const used = new Set(
    existingNumbers.filter((value): value is number => typeof value === "number" && value > 0)
  );

  let candidate = 1;
  while (used.has(candidate)) {
    candidate += 1;
  }

  return String(candidate);
}

export async function loadNextTournamentMatchNumber(
  supabase: SupabaseClient,
  tournamentId: string
) {
  const { data, error } = await supabase
    .from("matches")
    .select("match_number")
    .eq("tournament_id", tournamentId);

  if (error) {
    throw error;
  }

  return getNextAvailableMatchNumber((data ?? []).map((item) => item.match_number));
}
