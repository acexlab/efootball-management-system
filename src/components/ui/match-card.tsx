"use client";

import { CalendarDays, FilePenLine, MapPin, Radio, Trash2 } from "lucide-react";
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
  const canEditExistingResult = match.status === "Completed" && match.tournamentId && match.matchNumber;
  const resultHref = canEditExistingResult
    ? `/results?tournament=${encodeURIComponent(match.tournamentId ?? "")}&match=${encodeURIComponent(String(match.matchNumber ?? ""))}`
    : "/results";

  return (
    <article className="panel overflow-hidden rounded-xl p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-full text-[11px] uppercase tracking-[0.2em] text-[color:var(--text-muted)] sm:text-xs sm:tracking-[0.3em]">
          {match.tournament} {match.matchNumber ? `• Match ${match.matchNumber}` : ""}
        </p>
        <div className="self-start">
          <StatusPill label={match.status} tone={tone} />
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
        <div className="min-w-0">
          <p className="text-xs text-[color:var(--text-muted)]">Home</p>
          <p className="mt-1 truncate text-sm font-semibold text-white">{match.home}</p>
          <p className="mt-1 text-xs text-[color:var(--text-muted)]">
            Points: <span className="text-white">{match.homePoints ?? 0}</span>
          </p>
        </div>
        <div className="justify-self-start rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-center sm:justify-self-center">
          <p
            className="text-lg font-black tracking-[0.14em] text-white"
            style={{ fontFamily: "\"Orbitron\", sans-serif" }}
          >
            {(match.homePoints ?? match.homeScore)} : {(match.awayPoints ?? match.awayScore)}
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-[color:var(--text-muted)]">
            Points
          </p>
        </div>
        <div className="min-w-0 sm:text-right">
          <p className="text-xs text-[color:var(--text-muted)]">Away</p>
          <p className="mt-1 truncate text-sm font-semibold text-white">{match.away}</p>
          <p className="mt-1 text-xs text-[color:var(--text-muted)]">
            Points: <span className="text-white">{match.awayPoints ?? 0}</span>
          </p>
        </div>
      </div>

      {match.slots?.length ? (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">Slots</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {match.slots.map((slot, index) => (
              <span
                key={`${match.id}-slot-${index}`}
                className="max-w-full rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-white"
              >
                {slot}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 text-xs text-[color:var(--text-muted)] sm:flex sm:flex-wrap">
        <Meta icon={CalendarDays} text={match.date} />
        <Meta icon={MapPin} text={match.venue} />
        <Meta icon={Radio} text={match.status === "Live" ? "Broadcasting now" : "Match center"} />
      </div>

      <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
        <Link
          href={resultHref}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#00FF88]/30 bg-[#00FF88]/10 px-3 py-2 text-xs font-semibold text-[#00FF88] sm:justify-start"
        >
          {canEditExistingResult ? <FilePenLine className="h-3.5 w-3.5" /> : null}
          {canEditExistingResult ? "Edit Result" : "Enter Result"}
        </Link>
        {match.canDelete && onDelete ? (
          <button
            type="button"
            onClick={() => void onDelete(match)}
            disabled={deleting}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#FF5470]/30 bg-[#FF5470]/10 px-3 py-2 text-xs font-semibold text-[#FF9BAC] disabled:cursor-not-allowed disabled:opacity-60 sm:justify-start"
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
    <span className="inline-flex w-full max-w-full items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-2 py-1.5 text-xs sm:w-auto">
      <Icon className="h-3.5 w-3.5 flex-shrink-0 text-[#00D4FF]" />
      <span className="truncate">{text}</span>
    </span>
  );
}
