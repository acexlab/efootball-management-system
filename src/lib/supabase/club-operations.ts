import type { SupabaseClient } from "@supabase/supabase-js";

type ProfileAggregateRow = {
  id: string;
  full_name: string | null;
  gamer_tag: string | null;
  club_name: string | null;
  avatar_url: string | null;
};

type MatchStatAggregateRow = {
  player_id: string;
  goals: number;
  result: "win" | "draw" | "loss";
};

export async function syncClubLeaderboardFromStats(supabase: SupabaseClient) {
  const [{ data: profiles, error: profilesError }, { data: stats, error: statsError }] =
    await Promise.all([
      supabase.from("profiles").select("id, full_name, gamer_tag, club_name, avatar_url"),
      supabase.from("match_stats").select("player_id, goals, result")
    ]);

  if (profilesError) throw profilesError;
  if (statsError) throw statsError;

  const byPlayer = new Map<
    string,
    {
      player_id: string;
      player_name: string;
      player_handle: string;
      club_name: string;
      image_url: string;
      matches: number;
      wins: number;
      draws: number;
      losses: number;
      goals_scored: number;
      goals_conceded: number;
    }
  >();

  for (const profile of (profiles ?? []) as ProfileAggregateRow[]) {
    byPlayer.set(profile.id, {
      player_id: profile.id,
      player_name: profile.full_name || profile.gamer_tag || "Shield Member",
      player_handle: profile.gamer_tag || profile.full_name || `player-${profile.id.slice(0, 8)}`,
      club_name: profile.club_name || "Shield Esports",
      image_url: profile.avatar_url || "",
      matches: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals_scored: 0,
      goals_conceded: 0
    });
  }

  for (const stat of (stats ?? []) as MatchStatAggregateRow[]) {
    const current = byPlayer.get(stat.player_id);
    if (!current) continue;

    current.matches += 1;
    current.goals_scored += stat.goals;
    if (stat.result === "win") current.wins += 1;
    if (stat.result === "draw") current.draws += 1;
    if (stat.result === "loss") current.losses += 1;
  }

  const rows = [...byPlayer.values()];

  if (!rows.length) return;

  const { error } = await supabase.from("club_leaderboard").upsert(rows, {
    onConflict: "player_id"
  });

  if (error) throw error;
}
