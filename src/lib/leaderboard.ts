import type { LeaderboardRow, MatchResult, Player } from "@/lib/types";

export const POINTS_BY_RESULT: Record<MatchResult, number> = {
  Win: 3,
  Draw: 1,
  Loss: 0
};

export type LeaderboardSortKey = "performance" | "points" | "goals" | "wins";

export function buildLeaderboard(players: Player[]): LeaderboardRow[] {
  const rows = [...players].map((player) => ({
    ...player,
    points: player.wins * POINTS_BY_RESULT.Win + player.draws * POINTS_BY_RESULT.Draw,
    goalDifference: player.goals - player.conceded,
    rank: 0
  }));

  return rankLeaderboardRows(rows, "performance");
}

export function calculatePerformanceScore(
  row: Pick<LeaderboardRow, "points" | "wins" | "draws" | "losses" | "goals" | "goalDifference">
) {
  return (
    row.points +
    row.wins * 0.75 +
    row.draws * 0.25 +
    row.goals * 0.1 +
    row.goalDifference * 0.5 -
    row.losses * 2
  );
}

export function compareLeaderboardRows(
  a: LeaderboardRow,
  b: LeaderboardRow,
  sortBy: LeaderboardSortKey = "performance"
) {
  if (sortBy === "performance") {
    const performanceDelta = calculatePerformanceScore(b) - calculatePerformanceScore(a);
    if (performanceDelta !== 0) return performanceDelta;
  } else if (sortBy === "points") {
    if (b.points !== a.points) return b.points - a.points;
  } else if (sortBy === "goals") {
    if (b.goals !== a.goals) return b.goals - a.goals;
  } else if (b.wins !== a.wins) {
    return b.wins - a.wins;
  }

  if (b.points !== a.points) return b.points - a.points;
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.draws !== a.draws) return b.draws - a.draws;
  if (a.losses !== b.losses) return a.losses - b.losses;
  if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
  if (b.goals !== a.goals) return b.goals - a.goals;
  if (a.matches !== b.matches) return a.matches - b.matches;

  return a.handle.localeCompare(b.handle);
}

export function rankLeaderboardRows(rows: LeaderboardRow[], sortBy: LeaderboardSortKey = "performance") {
  return [...rows]
    .sort((a, b) => compareLeaderboardRows(a, b, sortBy))
    .map((row, index) => ({
      ...row,
      rank: index + 1
    }));
}
