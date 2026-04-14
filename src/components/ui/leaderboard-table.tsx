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
      <div className="rounded-lg border border-dashed border-white/12 bg-black/20 px-3 py-6 text-center text-xs text-[color:var(--text-muted)] sm:rounded-xl sm:px-4 sm:py-8 sm:text-sm md:rounded-[24px] md:px-6 md:py-10">
        {emptyMessage}
      </div>
    );
  }

  if (compact) {
    return (
      <>
        <div className="space-y-2 sm:hidden">
          {rows.map((row) => (
            <article key={row.id} className="panel rounded-xl p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {row.rank === 1 ? (
                    <StatusPill label="#1" tone="success" />
                  ) : (
                    <span className="text-sm font-semibold text-white">#{row.rank}</span>
                  )}
                  <UserAvatar src={row.image} name={row.name} className="h-10 w-10 flex-shrink-0 rounded-xl" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{row.handle}</p>
                    <p className="truncate text-xs text-[color:var(--text-muted)]">{row.name}</p>
                  </div>
                </div>
                <span className="rounded-full border border-[#00FF88]/25 bg-[#00FF88]/10 px-2 py-1 text-xs font-semibold text-[#00FF88]">
                  {row.points} pts
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <CompactStat label="Matches" value={row.matches} />
                <CompactStat label="Goals" value={row.goals} />
                <CompactStat label="Points" value={row.points} emphasis />
              </div>
            </article>
          ))}
        </div>

        <div className="hidden sm:block">
          <LeaderboardTableDesktop rows={rows} compact />
        </div>
      </>
    );
  }

  return <LeaderboardTableDesktop rows={rows} compact={false} />;
}

function LeaderboardTableDesktop({
  rows,
  compact
}: {
  rows: LeaderboardRow[];
  compact: boolean;
}) {
  return (
    <div className="overflow-x-auto scrollbar-none">
      <table className="min-w-full border-separate border-spacing-y-2 sm:border-spacing-y-3">
        <thead>
          <tr className="text-left text-xs uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
            <th className="px-2 py-2 sm:px-3 md:px-4">Rank</th>
            <th className="px-2 py-2 sm:px-3 md:px-4">Player</th>
            <th className="hidden px-2 py-2 sm:table-cell sm:px-3 md:px-4">Team</th>
            <th className="px-2 py-2 sm:px-3 md:px-4">Matches</th>
            {!compact && <th className="hidden px-2 py-2 sm:px-3 md:px-4 lg:table-cell">Wins</th>}
            {!compact && <th className="hidden px-2 py-2 sm:px-3 md:px-4 lg:table-cell">Draws</th>}
            {!compact && <th className="hidden px-2 py-2 sm:px-3 md:px-4 lg:table-cell">Losses</th>}
            <th className="hidden px-2 py-2 sm:px-3 md:table-cell md:px-4">GD</th>
            <th className="px-2 py-2 sm:px-3 md:px-4">Goals</th>
            <th className="px-2 py-2 sm:px-3 md:px-4">Points</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="panel overflow-hidden rounded-lg text-xs sm:rounded-xl sm:text-sm md:rounded-2xl">
              <td className="rounded-l-lg px-2 py-2 sm:rounded-l-xl sm:px-3 sm:py-3 md:rounded-l-2xl md:px-4 md:py-4">
                {row.rank === 1 ? (
                  <StatusPill label="#1" tone="success" />
                ) : (
                  <span className="text-xs font-semibold text-white sm:text-sm">#{row.rank}</span>
                )}
              </td>
              <td className="px-2 py-2 sm:px-3 sm:py-3 md:px-4 md:py-4">
                <div className="flex items-center gap-2">
                  <UserAvatar
                    src={row.image}
                    name={row.name}
                    className="h-8 w-8 flex-shrink-0 rounded-lg sm:h-9 sm:w-9 sm:rounded-lg md:h-11 md:w-11 md:rounded-xl"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-white sm:text-sm">{row.handle}</p>
                    <p className="hidden truncate text-xs text-[color:var(--text-muted)] sm:block">{row.name}</p>
                  </div>
                </div>
              </td>
              <td className="hidden truncate px-2 py-2 text-xs text-[color:var(--text-muted)] sm:table-cell sm:px-3 sm:py-3 sm:text-sm md:px-4 md:py-4">
                {row.team}
              </td>
              <td className="px-2 py-2 text-xs text-white sm:px-3 sm:py-3 sm:text-sm md:px-4 md:py-4">
                {row.matches}
              </td>
              {!compact && (
                <td className="hidden px-2 py-2 text-xs text-white sm:px-3 sm:py-3 sm:text-sm md:px-4 md:py-4 lg:table-cell">
                  {row.wins}
                </td>
              )}
              {!compact && (
                <td className="hidden px-2 py-2 text-xs text-white sm:px-3 sm:py-3 sm:text-sm md:px-4 md:py-4 lg:table-cell">
                  {row.draws}
                </td>
              )}
              {!compact && (
                <td className="hidden px-2 py-2 text-xs text-white sm:px-3 sm:py-3 sm:text-sm md:px-4 md:py-4 lg:table-cell">
                  {row.losses}
                </td>
              )}
              <td className="hidden px-2 py-2 text-xs text-white sm:px-3 sm:py-3 sm:text-sm md:table-cell md:px-4 md:py-4">
                {row.goalDifference}
              </td>
              <td className="px-2 py-2 text-xs text-white sm:px-3 sm:py-3 sm:text-sm md:px-4 md:py-4">{row.goals}</td>
              <td className="rounded-r-lg px-2 py-2 text-xs font-semibold text-[#00FF88] sm:rounded-r-xl sm:px-3 sm:py-3 sm:text-sm md:rounded-r-2xl md:px-4 md:py-4">
                {row.points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompactStat({
  label,
  value,
  emphasis = false
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/8 bg-black/20 px-2 py-2 text-center">
      <p className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${emphasis ? "text-[#00FF88]" : "text-white"}`}>{value}</p>
    </div>
  );
}
