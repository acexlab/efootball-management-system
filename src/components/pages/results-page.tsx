"use client";

import { Suspense } from "react";
import { Panel } from "@/components/ui/panel";
import { ResultEntryForm } from "@/components/ui/result-entry-form";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusPill } from "@/components/ui/status-pill";
import { useAuthProfile } from "@/hooks/use-auth-profile";
import { hasPermission } from "@/lib/rbac";

export function ResultsPage() {
  const { profile } = useAuthProfile();
  const canEnterResults = hasPermission(profile.role, "enter:results");
  const roleGateLabel = canEnterResults ? "Ready to submit" : "View only";

  return (
    <div className="space-y-4">
      <Panel className="p-4 sm:p-5">
        <SectionHeading
          eyebrow="Match workflow"
          title="Result Entry"
          description="Select a match day to create or edit a result, set lineup slots, enter player stats, and record the opponent score for GD."
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <StatusPill label={profile.role} tone={canEnterResults ? "success" : "neutral"} />
          <StatusPill label={roleGateLabel} tone={canEnterResults ? "info" : "warning"} />
        </div>
      </Panel>

      <Panel className="p-4 sm:p-5">
        <div className="grid gap-2 xl:grid-cols-3">
          <StepCard step="Step 1" title="Select tournament + match" />
          <StepCard step="Step 2" title="Select lineup slots" />
          <StepCard step="Step 3" title="Enter player stats" />
        </div>
        <div className="mt-4">
          <Suspense
            fallback={
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-[color:var(--text-muted)]">
                Loading result form...
              </div>
            }
          >
            <ResultEntryForm role={profile.role} />
          </Suspense>
        </div>
      </Panel>
    </div>
  );
}

function StepCard({ step, title }: { step: string; title: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
      <p className="text-xs uppercase tracking-[0.22em] text-[#00FF88]">{step}</p>
      <p className="mt-1 text-sm font-semibold text-white">{title}</p>
    </div>
  );
}
