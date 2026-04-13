"use client";

import { Activity, ShieldCheck, Swords, Trophy } from "lucide-react";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { Panel } from "@/components/ui/panel";

const iconMap = [Trophy, Swords, ShieldCheck, Activity];

export function StatCard({
  label,
  value,
  change,
  accent,
  index
}: {
  label: string;
  value: number;
  change: string;
  accent: string;
  index: number;
}) {
  const Icon = iconMap[index % iconMap.length];

  return (
    <div className="transition-transform duration-200 hover:-translate-y-1">
      <Panel className="group relative h-full overflow-hidden p-3 sm:p-4 md:p-5 transition duration-200 hover:border-white/12">
        <div className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-100`} />
        <div className="relative flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs sm:text-sm uppercase tracking-[0.24em] text-[color:var(--text-muted)] truncate">{label}</p>
            <p className="mt-2 sm:mt-3 md:mt-4 text-2xl sm:text-3xl md:text-4xl font-black text-white">
              <AnimatedCounter value={value} />
            </p>
          </div>
          <div className="rounded-lg sm:rounded-xl md:rounded-2xl border border-white/10 bg-white/[0.04] p-2 sm:p-2.5 md:p-3 text-[#00FF88] shadow-[0_0_32px_rgba(0,255,136,0.14)] transition duration-300 group-hover:shadow-[0_0_40px_rgba(0,255,136,0.22)] flex-shrink-0">
            <Icon className="h-4 w-4 sm:h-4.5 sm:w-4.5 md:h-5 md:w-5" />
          </div>
        </div>
        <div className="relative mt-3 sm:mt-4 md:mt-6 flex items-center justify-between gap-2">
          <span className="text-xs sm:text-sm text-[color:var(--text-muted)]">vs last cycle</span>
          <span className="rounded-full border border-[#00FF88]/20 bg-[#00FF88]/10 px-2 sm:px-3 py-0.5 sm:py-1 text-xs font-semibold text-[#00FF88] flex-shrink-0">
            {change}
          </span>
        </div>
      </Panel>
    </div>
  );
}
