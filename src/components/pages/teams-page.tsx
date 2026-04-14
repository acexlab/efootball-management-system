"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldPlus } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusPill } from "@/components/ui/status-pill";
import { TeamManagementPanel } from "@/components/ui/team-management-panel";
import { useAuthProfile } from "@/hooks/use-auth-profile";
import { hasPermission } from "@/lib/rbac";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function TeamsPage() {
  const { session, profile } = useAuthProfile();
  const canManageAll = hasPermission(profile.role, "manage:tournaments");
  const [manageableTournamentIds, setManageableTournamentIds] = useState<string[]>([]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    async function loadManageableTournaments() {
      if (!supabase || !session?.user?.id || canManageAll) {
        setManageableTournamentIds([]);
        return;
      }

      const { data, error } = await supabase
        .from("tournament_participants")
        .select("tournament_id")
        .eq("user_id", session.user.id)
        .in("role", ["captain", "vice_captain"]);

      if (error) {
        setManageableTournamentIds([]);
        return;
      }

      setManageableTournamentIds((data ?? []).map((item) => item.tournament_id));
    }

    void loadManageableTournaments();
  }, [canManageAll, session?.user?.id]);

  const canBuildTeams = canManageAll || manageableTournamentIds.length > 0;

  const description = useMemo(
    () =>
      canBuildTeams
        ? "Create or update tournament squads, upload team logos, and manage roster changes instantly."
        : "Review active tournament squads and player assignments.",
    [canBuildTeams]
  );

  return (
    <div className="space-y-4">
      <Panel className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <SectionHeading eyebrow="Team ops" title="Teams" description={description} />
          <StatusPill
            label={canBuildTeams ? "Builder Enabled" : "Squads Only"}
            tone={canBuildTeams ? "success" : "warning"}
          />
        </div>
      </Panel>

      <TeamManagementPanel
        canManageAll={canManageAll}
        canBuildTeams={canBuildTeams}
        manageableTournamentIds={manageableTournamentIds}
        standalone
      />

      <Panel className="p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <ShieldPlus className="h-5 w-5 text-[#00D4FF]" />
          </div>
          <p className="text-sm text-[color:var(--text-muted)]">
            Team logos and team details update right away after save.
          </p>
        </div>
      </Panel>
    </div>
  );
}
