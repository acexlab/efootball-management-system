import { StatusPill } from "@/components/ui/status-pill";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { LeaderboardRow } from "@/lib/types";

export function LeaderboardTable({
  rows,
  compact = false,
  emptyMessage = "No leaderboard entries yet."
}: {
  rows: LeaderboardRow[];
  compact?: boolean;
  emptyMessage?: string;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-lg sm:rounded-xl md:rounded-[24px] border border-dashed border-white/12 bg-black/20 px-3 sm:px-4 md:px-6 py-6 sm:py-8 md:py-10 text-center text-xs sm:text-sm text-[color:var(--text-muted)]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto scrollbar-none">
      <table className="min-w-full border-separate border-spacing-y-2 sm:border-spacing-y-3">
        <thead>
          <tr className="text-left text-xs uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
            <th className="px-2 sm:px-3 md:px-4 py-2">Rank</th>
            <th className="px-2 sm:px-3 md:px-4 py-2">Player</th>
            <th className="px-2 sm:px-3 md:px-4 py-2 hidden sm:table-cell">Team</th>
            <th className="px-2 sm:px-3 md:px-4 py-2">Matches</th>
            {!compact && <th className="px-2 sm:px-3 md:px-4 py-2 hidden lg:table-cell">Wins</th>}
            {!compact && <th className="px-2 sm:px-3 md:px-4 py-2 hidden lg:table-cell">Draws</th>}
            {!compact && <th className="px-2 sm:px-3 md:px-4 py-2 hidden lg:table-cell">Losses</th>}
            <th className="px-2 sm:px-3 md:px-4 py-2 hidden md:table-cell">GD</th>
            <th className="px-2 sm:px-3 md:px-4 py-2">Goals</th>
            <th className="px-2 sm:px-3 md:px-4 py-2">Points</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="panel overflow-hidden rounded-lg sm:rounded-xl md:rounded-2xl text-xs sm:text-sm">
              <td className="rounded-l-lg sm:rounded-l-xl md:rounded-l-2xl px-2 sm:px-3 md:px-4 py-2 sm:py-3 md:py-4">
                {row.rank === 1 ? (
                  <StatusPill label="#1" tone="success" />
                ) : (
                  <span className="text-xs sm:text-sm font-semibold text-white">#{row.rank}</span>
                )}
              </td>
              <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 md:py-4">
                <div className="flex items-center gap-2">
                  <UserAvatar src={row.image} name={row.name} className="h-8 w-8 sm:h-9 sm:w-9 md:h-11 md:w-11 rounded-lg sm:rounded-lg md:rounded-xl flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-white text-xs sm:text-sm truncate">{row.handle}</p>
                    <p className="text-xs text-[color:var(--text-muted)] hidden sm:block truncate">{row.name}</p>
                  </div>
                </div>
              </td>
              <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 md:py-4 text-[color:var(--text-muted)] hidden sm:table-cell text-xs sm:text-sm truncate">{row.team}</td>
              <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 md:py-4 text-white text-xs sm:text-sm">{row.matches}</td>
              {!compact && <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 md:py-4 text-white hidden lg:table-cell text-xs sm:text-sm">{row.wins}</td>}
              {!compact && <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 md:py-4 text-white hidden lg:table-cell text-xs sm:text-sm">{row.draws}</td>}
              {!compact && <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 md:py-4 text-white hidden lg:table-cell text-xs sm:text-sm">{row.losses}</td>}
              <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 md:py-4 text-white hidden md:table-cell text-xs sm:text-sm">{row.goalDifference}</td>
              <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 md:py-4 text-white text-xs sm:text-sm">{row.goals}</td>
              <td className="rounded-r-lg sm:rounded-r-xl md:rounded-r-2xl px-2 sm:px-3 md:px-4 py-2 sm:py-3 md:py-4 text-xs sm:text-sm font-semibold text-[#00FF88]">
                {row.points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
