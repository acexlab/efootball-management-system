"use client";

import { CalendarDays, MapPin, Radio, Trash2 } from "lucide-react";
import Link from "next/link";
import { StatusPill } from "@/components/ui/status-pill";
import type { ClubMatch } from "@/lib/types";

export function MatchCard({
  match,
  onDelete,
  deleting = false
}: {
  match: ClubMatch;
  onDelete?: (match: ClubMatch) => void | Promise<void>;
  deleting?: boolean;
}) {
  const tone =
    match.status === "Completed" ? "success" : match.status === "Live" ? "danger" : "info";

  return (
    <article className="panel rounded-xl p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--text-muted)] truncate">
          {match.tournament} {match.matchNumber ? `• Match ${match.matchNumber}` : ""}
        </p>
        <StatusPill label={match.status} tone={tone} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[color:var(--text-muted)]">Home</p>
          <p className="mt-1 text-sm font-semibold text-white truncate">{match.home}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-center flex-shrink-0">
          <p
            className="text-lg font-black tracking-[0.14em] text-white"
            style={{ fontFamily: "\"Orbitron\", sans-serif" }}
          >
            {match.homeScore} : {match.awayScore}
          </p>
        </div>
        <div className="text-right min-w-0 flex-1">
          <p className="text-xs text-[color:var(--text-muted)]">Away</p>
          <p className="mt-1 text-sm font-semibold text-white truncate">{match.away}</p>
        </div>
      </div>

      {match.slots?.length ? (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Slots</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {match.slots.map((slot, index) => (
              <span key={`${match.id}-slot-${index}`} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-white">
                {slot}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-[color:var(--text-muted)]">
        <Meta icon={CalendarDays} text={match.date} />
        <Meta icon={MapPin} text={match.venue} />
        <Meta icon={Radio} text={match.status === "Live" ? "Broadcasting now" : "Match center"} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href="/results"
          className="inline-flex items-center rounded-lg border border-[#00FF88]/30 bg-[#00FF88]/10 px-3 py-2 text-xs font-semibold text-[#00FF88]"
        >
          Enter Result
        </Link>
        {match.canDelete && onDelete ? (
          <button
            type="button"
            onClick={() => void onDelete(match)}
            disabled={deleting}
            className="inline-flex items-center gap-2 rounded-lg border border-[#FF5470]/30 bg-[#FF5470]/10 px-3 py-2 text-xs font-semibold text-[#FF9BAC] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {deleting ? "Deleting..." : "Delete Result"}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function Meta({
  icon: Icon,
  text
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-2 py-1.5 text-xs truncate">
      <Icon className="h-3.5 w-3.5 text-[#00D4FF] flex-shrink-0" />
      <span className="truncate">{text}</span>
    </span>
  );
}
