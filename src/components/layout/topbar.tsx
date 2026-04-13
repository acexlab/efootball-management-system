"use client";

import Link from "next/link";
import { Bell, Search, Sparkles } from "lucide-react";
import { useAuthProfile } from "@/hooks/use-auth-profile";
import { UserAvatar } from "@/components/ui/user-avatar";

export function Topbar() {
  const { session, loading, profile } = useAuthProfile();
  const signedInLabel = session?.user.email?.split("@")[0] ?? profile.handle;
  const stateLabel = loading ? "Syncing" : session ? profile.role : "Guest";
  const stateText = loading
    ? "Checking account session"
    : session
      ? session.user.email ?? profile.club
      : "Login available on the dashboard page";

  return (
    <header className="panel flex flex-col gap-3 rounded-2xl px-3 py-3 sm:rounded-[24px] sm:px-4 sm:py-4 lg:flex-row lg:items-center lg:justify-between lg:gap-5">
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-[0.32em] text-[color:var(--text-muted)] truncate">
          Elite control center
        </p>
        <div className="mt-1 flex flex-col gap-2 sm:mt-2 sm:flex-row sm:items-center sm:gap-3">
          <h1
            className="text-xl sm:text-2xl md:text-3xl font-black uppercase tracking-[0.14em] text-white leading-tight"
            style={{ fontFamily: "\"Orbitron\", sans-serif" }}
          >
            {session ? "Welcome," : "Control,"}{" "}
            <span className="text-gradient">{signedInLabel}</span>
          </h1>
          <span className="rounded-full border border-[#00FF88]/30 bg-[#00FF88]/12 px-2 sm:px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#00FF88] inline-flex flex-shrink-0 w-fit">
            {stateLabel}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:gap-3 lg:ml-auto lg:min-w-[min(100%,660px)] lg:flex-row lg:items-center lg:justify-end">
        <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3 text-sm text-[color:var(--text-muted)] lg:min-w-[280px] lg:flex-1">
          <Search className="h-4 w-4 text-[#00D4FF] flex-shrink-0" />
          <span className="truncate">Search players, matches, tournaments</span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] text-white transition hover:border-[#00D4FF]/30 hover:bg-[#00D4FF]/10 flex-shrink-0 sm:h-11 sm:w-11"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#00FF88] sm:right-2 sm:top-2 sm:h-2.5 sm:w-2.5" />
          </button>

          <Link
            href="/profile"
            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 transition hover:border-[#00FF88]/25 hover:bg-white/[0.05] sm:min-h-12 lg:max-w-[320px]"
          >
            <UserAvatar src={profile.image} name={profile.name} className="h-9 w-9 flex-shrink-0 sm:h-10 sm:w-10 md:h-11 md:w-11" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{profile.name}</p>
              <p className="truncate text-xs text-[color:var(--text-muted)]">{stateText}</p>
            </div>
            <Sparkles className="hidden h-4 w-4 flex-shrink-0 text-[#7A5CFF] md:block" />
          </Link>
        </div>
      </div>
    </header>
  );
}
