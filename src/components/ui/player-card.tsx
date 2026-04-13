"use client";

import Image from "next/image";
import type { Player } from "@/lib/types";

export function PlayerCard({ player, highlight = false }: { player: Player; highlight?: boolean }) {
  return (
    <article
      className={`panel relative overflow-hidden rounded-2xl sm:rounded-[24px] md:rounded-[26px] p-3 sm:p-4 ${
        highlight ? "border-[#00FF88]/25 shadow-[0_0_40px_rgba(0,255,136,0.14)]" : ""
      } transition-transform duration-200 hover:-translate-y-1`}
    >
      <div className="absolute inset-x-0 top-0 h-20 sm:h-24 md:h-28 bg-gradient-to-br from-[#00D4FF]/20 via-transparent to-[#7A5CFF]/18" />
      <div className="relative flex items-start gap-2 sm:gap-3 md:gap-4">
        <div className="relative h-20 w-16 sm:h-24 sm:w-20 overflow-hidden rounded-lg sm:rounded-xl md:rounded-[22px] border border-white/10 flex-shrink-0">
          <Image src={player.image} alt={`${player.name} - Player profile`} fill className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--text-muted)] truncate">{player.team}</p>
          <h3 className="mt-1 sm:mt-2 text-base sm:text-lg font-semibold text-white truncate">{player.handle}</h3>
          <p className="text-xs sm:text-sm text-[color:var(--text-muted)] truncate">{player.name}</p>
          <div className="mt-2 sm:mt-3 flex flex-wrap gap-1 sm:gap-2">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 sm:px-3 py-0.5 sm:py-1 text-xs uppercase tracking-[0.2em] text-white whitespace-nowrap">
              {player.position}
            </span>
            <span className="rounded-full border border-[#00FF88]/20 bg-[#00FF88]/10 px-2 sm:px-3 py-0.5 sm:py-1 text-xs uppercase tracking-[0.2em] text-[#00FF88] whitespace-nowrap">
              {player.rating} OVR
            </span>
          </div>
        </div>
      </div>
      <div className="relative mt-3 sm:mt-4 md:mt-5 grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Goals" value={player.goals} />
        <Stat label="Matches" value={player.matches} />
        <Stat label="Rating" value={player.rating} />
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg sm:rounded-xl md:rounded-2xl border border-white/8 bg-black/20 px-2 sm:px-3 py-2 sm:py-3 text-center">
      <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--text-muted)]">{label}</p>
      <p className="mt-1 sm:mt-2 text-base sm:text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
