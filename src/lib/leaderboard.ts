import type { LeaderboardRow, MatchResult, Player } from "@/lib/types";

export const POINTS_BY_RESULT: Record<MatchResult, number> = {
  Win: 3,
  Draw: 1,
  Loss: 0
};

export function buildLeaderboard(players: Player[]): LeaderboardRow[] {
  return [...players]
    .map((player) => ({
      ...player,
      points: player.wins * POINTS_BY_RESULT.Win + player.draws * POINTS_BY_RESULT.Draw,
      goalDifference: player.goals - player.conceded,
      rank: 0
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      return b.goals - a.goals;
    })
    .map((player, index) => ({
      ...player,
      rank: index + 1
    }));
}
