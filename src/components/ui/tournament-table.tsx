"use client";

import { useMemo, useState } from "react";
import { Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { CreateTournamentModal, type NewTournament } from "@/components/ui/create-tournament-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import type { PlayerOption, Tournament, TournamentStatus } from "@/lib/types";

export function TournamentTable({
  items,
  captainNames,
  canManage,
  loading = false,
  onCreate,
  createDisabled = false,
  playerOptions,
  onDelete,
  deletingTournamentId
}: {
  items: Tournament[];
  captainNames: Record<string, string>;
  canManage: boolean;
  loading?: boolean;
  onCreate?: (tournament: NewTournament) => void | Promise<void>;
  createDisabled?: boolean;
  playerOptions: PlayerOption[];
  onDelete?: (tournament: Tournament) => void | Promise<void>;
  deletingTournamentId?: string | null;
}) {
  const [filter, setFilter] = useState<TournamentStatus | "All">("All");
  const [open, setOpen] = useState(false);

  const visibleItems = useMemo(() => {
    if (filter === "All") return items;
    return items.filter((item) => item.status === filter);
  }, [filter, items]);

  return (
    <>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {["All", "Ongoing", "Upcoming", "Completed"].map((item) => (
            <button
              key={item}
              onClick={() => setFilter(item as TournamentStatus | "All")}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                filter === item
                  ? "border-[#00FF88]/30 bg-[#00FF88]/12 text-[#00FF88]"
                  : "border-white/10 bg-white/[0.03] text-[color:var(--text-muted)] hover:text-white"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <button className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white">
            <SlidersHorizontal className="h-4 w-4 text-[#00D4FF]" />
            Filter presets
          </button>
          <button
            onClick={() => setOpen(true)}
            disabled={!canManage || createDisabled || !onCreate}
            className="inline-flex items-center gap-2 rounded-2xl border border-[#00FF88]/30 bg-[#00FF88]/12 px-4 py-3 text-sm font-semibold text-[#00FF88] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Create Tournament
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 flex min-h-[220px] items-center justify-center rounded-[28px] border border-white/8 bg-black/20 text-sm text-[color:var(--text-muted)]">
          Loading tournament data...
        </div>
      ) : visibleItems.length ? (
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-3">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
                <th className="px-4">Name</th>
                <th className="px-4">Start</th>
                <th className="px-4">End</th>
                <th className="px-4">Players</th>
                <th className="px-4">Status</th>
                <th className="px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => (
                <tr key={item.id} className="panel rounded-2xl">
                  <td className="rounded-l-2xl px-4 py-4">
                    <p className="font-semibold text-white">{item.name}</p>
                    <p className="text-sm text-[color:var(--text-muted)]">
                      {item.format} • {item.externalCompetition ?? "Club Competition"}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-sm text-white">{item.startDate}</td>
                  <td className="px-4 py-4 text-sm text-white">{item.endDate}</td>
                  <td className="px-4 py-4 text-sm text-white">
                    {item.players}
                    <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                      Captain: {item.captainId ? captainNames[item.captainId] ?? "Unassigned" : "Unassigned"}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <StatusPill
                      label={item.status}
                      tone={
                        item.status === "Ongoing"
                          ? "success"
                          : item.status === "Upcoming"
                            ? "info"
                            : "warning"
                      }
                    />
                  </td>
                  <td className="rounded-r-2xl px-4 py-4">
                    <div className="flex gap-2">
                      <button className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white">
                        View
                      </button>
                      <button className="rounded-xl border border-white/10 px-3 py-2 text-sm text-[color:var(--text-muted)]">
                        Review
                      </button>
                      {canManage && onDelete ? (
                        <button
                          type="button"
                          onClick={() => void onDelete(item)}
                          disabled={deletingTournamentId === item.id}
                          className="inline-flex items-center gap-2 rounded-xl border border-[#FF5470]/30 px-3 py-2 text-sm text-[#FF9BAC] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 className="h-4 w-4" />
                          {deletingTournamentId === item.id ? "Deleting..." : "Delete"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-6">
          <EmptyState
            icon={SlidersHorizontal}
            title="No tournaments created yet"
            description="Real tournaments will appear here after an Admin or Super Admin creates the first competition."
          />
        </div>
      )}

      <CreateTournamentModal
        open={open && canManage && Boolean(onCreate)}
        onClose={() => setOpen(false)}
        onCreate={(tournament) => void onCreate?.(tournament)}
        playerOptions={playerOptions}
      />
    </>
  );
}
