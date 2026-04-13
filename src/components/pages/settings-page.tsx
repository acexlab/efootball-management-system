"use client";

import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusPill } from "@/components/ui/status-pill";
import { useAuthProfile } from "@/hooks/use-auth-profile";
import { ROLE_DESCRIPTIONS, hasPermission } from "@/lib/rbac";

export function SettingsPage() {
  const { profile } = useAuthProfile();

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <Panel className="p-6">
        <SectionHeading
          eyebrow="System config"
          title="Settings"
          description="Notification and system toggles shaped by the current role."
        />
        <div className="mt-6 space-y-4">
          <Toggle label="Live result notifications" enabled />
          <Toggle label="Realtime leaderboard updates" enabled />
          <Toggle label="Tournament review reminders" enabled={hasPermission(profile.role, "enter:results")} />
          <Toggle label="System reset tools" enabled={hasPermission(profile.role, "reset:system")} />
        </div>
      </Panel>

      <Panel className="p-6">
        <SectionHeading
          eyebrow="Permissions"
          title="Role Access"
          description="Role-based access is enforced in the navigation, tournament control, results, and user management flows."
        />
        <div className="mt-6 rounded-[24px] border border-white/8 bg-black/20 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-[color:var(--text-muted)]">Current account role</p>
            <StatusPill label={profile.role} tone={profile.role === "Super Admin" ? "success" : profile.role === "Admin" ? "info" : "neutral"} />
          </div>
          <p className="mt-4 text-sm leading-6 text-[color:var(--text-muted)]">
            {ROLE_DESCRIPTIONS[profile.role]}
          </p>
          <pre className="mt-6 overflow-auto rounded-2xl border border-white/8 bg-[#05080D] p-4 text-xs leading-6 text-[#BFEFFF]">
            <code>{`update public.profiles\nset role = 'Admin'\nwhere email = 'player@neonstrikers.com';`}</code>
          </pre>
        </div>
      </Panel>
    </div>
  );
}

function Toggle({ label, enabled = false }: { label: string; enabled?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-[22px] border border-white/8 bg-black/20 px-4 py-4">
      <span className="text-sm text-white">{label}</span>
      <span
        className={`inline-flex h-7 w-14 items-center rounded-full border px-1 ${
          enabled
            ? "border-[#00FF88]/30 bg-[#00FF88]/12 justify-end"
            : "border-white/10 bg-white/[0.05] justify-start"
        }`}
      >
        <span
          className={`h-5 w-5 rounded-full ${enabled ? "bg-[#00FF88]" : "bg-[color:var(--text-muted)]"}`}
        />
      </span>
    </div>
  );
}
