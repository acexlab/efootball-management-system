"use client";

import { Suspense } from "react";
import { Panel } from "@/components/ui/panel";
import { ResultViewer } from "@/components/ui/result-viewer";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusPill } from "@/components/ui/status-pill";

export function ResultViewerPage() {
  return (
    <div className="space-y-4">
      <Panel className="p-4 sm:p-5">
        <SectionHeading
          eyebrow="Match archive"
          title="View Result"
          description="Read the full saved result, player goals, opponent goals, and match summary."
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <StatusPill label="Public View" tone="info" />
          <StatusPill label="Read Only" tone="neutral" />
        </div>
      </Panel>

      <Panel className="p-4 sm:p-5">
        <Suspense
          fallback={
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-[color:var(--text-muted)]">
              Loading saved result...
            </div>
          }
        >
          <ResultViewer />
        </Suspense>
      </Panel>
    </div>
  );
}
