"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Download } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusPill } from "@/components/ui/status-pill";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type TournamentInfo = {
  id: string;
  name: string;
  external_competition: string | null;
};

export function TournamentReportPage() {
  const params = useParams<{ id: string }>();
  const tournamentId = params?.id ?? "";
  const [tournament, setTournament] = useState<TournamentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !tournamentId) {
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("tournaments")
        .select("id, name, external_competition")
        .eq("id", tournamentId)
        .maybeSingle();

      if (error || !data) {
        setMessage(error?.message ?? "Tournament not found.");
        setTournament(null);
      } else {
        setTournament(data);
      }

      setLoading(false);
    };

    void load();
  }, [tournamentId]);

  async function handleDownload() {
    if (!tournamentId) return;
    setDownloading(true);
    setMessage("");

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        throw new Error("Supabase is not configured.");
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        throw new Error(sessionError.message);
      }
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error("Please sign in to download the report.");
      }

      const response = await fetch(`/api/reports/tournament/${tournamentId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Report generation failed." }));
        throw new Error(error.error ?? "Report generation failed.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${tournament?.name ?? "tournament"}-matchday-report.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Report generation failed.";
      setMessage(detail);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Panel className="p-4 sm:p-5">
        <SectionHeading
          eyebrow="Reports"
          title="Tournament Matchday Report"
          description="Generate a PDF report up to the latest match day with recorded results."
        />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusPill label={tournament?.name ?? "Tournament"} tone="info" />
          <StatusPill
            label={tournament?.external_competition ?? "Shield Esports"}
            tone="neutral"
          />
        </div>
      </Panel>

      <Panel className="p-4 sm:p-5">
        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-[color:var(--text-muted)]">
            Loading report details...
          </div>
        ) : tournament ? (
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm text-[color:var(--text-muted)]">Tournament</p>
              <p className="mt-2 text-lg font-semibold text-white">{tournament.name}</p>
              <p className="mt-1 text-sm text-[color:var(--text-muted)]">
                {tournament.external_competition ?? "Shield Esports Competition"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={downloading}
              className="inline-flex items-center gap-2 rounded-2xl border border-[#00D4FF]/30 bg-[#00D4FF]/10 px-4 py-3 text-sm font-semibold text-[#8BE8FF] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              {downloading ? "Preparing PDF..." : "Download Matchday Report"}
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-[color:var(--text-muted)]">
            {message || "Tournament not found."}
          </div>
        )}

        {message && tournament ? (
          <div className="mt-4 rounded-2xl border border-[#FF5470]/30 bg-[#FF5470]/10 px-4 py-3 text-sm text-[#FFB3C0]">
            {message}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
