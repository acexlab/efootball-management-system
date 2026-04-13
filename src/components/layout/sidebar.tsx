"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  LineChart,
  Menu,
  Settings,
  Shield,
  Swords,
  Trophy,
  Users,
  X
} from "lucide-react";
import { ROLE_DESCRIPTIONS, hasPermission } from "@/lib/rbac";
import { useAuthProfile } from "@/hooks/use-auth-profile";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
};

const navSections: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Dashboard",
    items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }]
  },
  {
    title: "Management",
    items: [
      { href: "/users", label: "Users", icon: Shield, permission: "manage:users" },
      { href: "/players", label: "Players", icon: Users }
    ]
  },
  {
    title: "Tournaments",
    items: [
      { href: "/tournaments", label: "Tournaments", icon: Trophy, permission: "manage:tournaments" },
      { href: "/matches", label: "Matches", icon: Swords },
      { href: "/results", label: "Result Entry", icon: ClipboardList }
    ]
  },
  {
    title: "Analytics",
    items: [
      { href: "/leaderboard", label: "Leaderboard", icon: BarChart3 },
      { href: "/reports", label: "Reports", icon: LineChart, permission: "view:reports" }
    ]
  },
  {
    title: "Settings",
    items: [{ href: "/settings", label: "Settings", icon: Settings }]
  }
];

export function Sidebar() {
  const pathname = usePathname();
  const { profile } = useAuthProfile();
  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.permission || hasPermission(profile.role, item.permission)
      )
    }))
    .filter((section) => section.items.length > 0);

  const renderNavLink = (item: NavItem) => {
    const active = pathname === item.href;
    const Icon = item.icon;

    return (
      <Link
        key={item.href}
        href={item.href}
        className={`group flex items-center gap-3 rounded-xl border px-3 py-2 transition-all duration-300 ${
          active
            ? "border-[#00FF88]/30 bg-[#00FF88]/10 text-white"
            : "border-transparent bg-white/[0.02] text-[color:var(--text-muted)] hover:border-white/8 hover:bg-white/[0.04] hover:text-white"
        }`}
      >
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-300 flex-shrink-0 ${
            active
              ? "bg-[#00FF88]/14 text-[#00FF88]"
              : "bg-white/[0.04] text-[color:var(--text-muted)] group-hover:text-[#00D4FF]"
          }`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-sm font-medium truncate">{item.label}</span>
      </Link>
    );
  };

  return (
    <aside className="panel hidden w-[260px] shrink-0 rounded-2xl px-4 py-5 lg:flex lg:flex-col">
      <div className="flex items-center gap-3 border-b border-white/8 pb-4">
        <div className="relative h-11 w-11 overflow-hidden rounded-xl border border-white/10 bg-white/5">
          <Image src="/brand/shield-logo.jpg" alt="Shield Esports logo" fill className="object-cover" />
        </div>
        <div>
          <p
            className="text-base font-black uppercase tracking-[0.25em] text-white"
            style={{ fontFamily: "\"Orbitron\", sans-serif" }}
          >
            Shield
          </p>
          <p className="text-xs text-[color:var(--text-muted)]">Shield Esports Ops</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[#00FF88]/12 bg-[#00FF88]/6 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/6">
            <Shield className="h-4 w-4 text-[#00D4FF]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)] truncate">Role</p>
            <p className="font-semibold text-white text-sm truncate">{profile.role}</p>
          </div>
        </div>
        <p className="mt-2 text-xs leading-5 text-[color:var(--text-muted)]">{ROLE_DESCRIPTIONS[profile.role]}</p>
      </div>

      <nav className="mt-4 flex-1 space-y-4 overflow-y-auto">
        {visibleSections.map((section) => (
          <div key={section.title}>
            <p className="mb-2 text-[10px] uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
              {section.title}
            </p>
            <div className="space-y-1.5">{section.items.map((item) => renderNavLink(item))}</div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const { profile } = useAuthProfile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const visibleNavItems = navSections
    .flatMap((section) => section.items)
    .filter((item) => !item.permission || hasPermission(profile.role, item.permission));

  return (
    <>
      {/* Mobile Hamburger Menu */}
      <div className="mb-3 flex items-center justify-between px-1 lg:hidden">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white transition hover:border-[#00D4FF]/30 hover:bg-[#00D4FF]/10"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Mobile Drawer Menu - Shows when hamburger is clicked */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <nav className="absolute bottom-0 left-0 right-0 max-h-[78vh] overflow-y-auto rounded-t-[28px] border-t border-white/8 bg-[#0b0f14]/96 px-1 pb-4 pt-3 shadow-[0_-24px_48px_rgba(0,0,0,0.35)]">
            <div className="space-y-1 p-4">
              {visibleNavItems.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                      active
                        ? "border-[#00FF88]/30 bg-[#00FF88]/12 text-[#00FF88]"
                        : "border-white/10 bg-white/[0.03] text-[color:var(--text-muted)]"
                    }`}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      )}

      {/* Horizontal Tab Navigation */}
      <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 lg:hidden">
        {visibleNavItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`inline-flex shrink-0 items-center gap-2 rounded-lg sm:rounded-xl border px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm transition ${
                active
                  ? "border-[#00FF88]/30 bg-[#00FF88]/12 text-[#00FF88]"
                  : "border-white/10 bg-white/[0.03] text-[color:var(--text-muted)]"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
