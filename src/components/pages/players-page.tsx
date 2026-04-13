"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusPill } from "@/components/ui/status-pill";
import { UserAvatar } from "@/components/ui/user-avatar";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type { Role } from "@/lib/types";

type ProfileRow = {
  id: string;
  full_name: string | null;
  gamer_tag: string | null;
  role: Role | null;
  avatar_url: string | null;
  club_name: string | null;
};

type PlayerRow = {
  id: string;
  name: string;
  handle: string;
  role: Role;
  club: string;
  avatarUrl: string | null;
  matches: number;
  goals: number;
  points: number;
};

export function PlayersPage() {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(hasSupabaseConfig());
  const [message, setMessage] = useState("");

  const loadPlayers = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setPlayers([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, gamer_tag, role, avatar_url, club_name")
      .order("created_at", { ascending: true });

    if (error) {
      setMessage(`Player profiles are unavailable until full-management-setup.sql is active. ${error.message}`);
      setPlayers([]);
      setLoading(false);
      return;
    }

    const profileRows = (data ?? []) as ProfileRow[];

    const { data: leaderboardRows } = await supabase
      .from("club_leaderboard")
      .select("player_id, matches, wins, draws, goals_scored, points");

    const statsMap = Object.fromEntries(
      (leaderboardRows ?? []).map((row) => [
        row.player_id as string,
        {
          matches: row.matches as number,
          goals: row.goals_scored as number,
          points: (row.points as number | null) ?? (((row.wins as number) * 3) + (row.draws as number))
        }
      ])
    );

    setPlayers(
      profileRows.map((profile) => ({
        id: profile.id,
        name: profile.full_name || profile.gamer_tag || "Shield Member",
        handle: profile.gamer_tag || profile.full_name || "member",
        role: profile.role ?? "Player",
        club: profile.club_name || "Shield Esports",
        avatarUrl: profile.avatar_url,
        matches: statsMap[profile.id]?.matches ?? 0,
        goals: statsMap[profile.id]?.goals ?? 0,
        points: statsMap[profile.id]?.points ?? 0
      }))
    );
    setMessage("");
    setLoading(false);
  }, []);

  const syncPlayers = useEffectEvent(() => {
    void loadPlayers();
  });

  useEffect(() => {
    syncPlayers();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const refreshPlayers = () => {
      syncPlayers();
    };

    window.addEventListener("efcms:profile-updated", refreshPlayers);
    return () => {
      window.removeEventListener("efcms:profile-updated", refreshPlayers);
    };
  }, []);

  return (
    <div className="space-y-6">
      <Panel className="p-6">
        <SectionHeading
          eyebrow="Squad roster"
          title="Players"
          description="Signed-up club members are shown here with their real profile photo, in-game name, role, and live stats."
        />
        {message ? (
          <div className="mt-6 rounded-[24px] border border-[#7A5CFF]/25 bg-[#7A5CFF]/10 px-4 py-3 text-sm text-[#E3DAFF]">
            {message}
          </div>
        ) : null}
      </Panel>

      <Panel className="p-6">
        {loading ? (
          <div className="flex min-h-[260px] items-center justify-center rounded-[28px] border border-white/8 bg-black/20 text-sm text-[color:var(--text-muted)]">
            Loading player roster...
          </div>
        ) : players.length ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {players.map((player) => (
              <article
                key={player.id}
                className="overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-5"
              >
                <div className="flex items-start gap-4">
                  <UserAvatar src={player.avatarUrl} name={player.name} className="h-24 w-24 rounded-[24px]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">{player.club}</p>
                    <h3 className="mt-2 truncate text-2xl font-semibold text-white">{player.handle}</h3>
                    <p className="truncate text-sm text-[color:var(--text-muted)]">{player.name}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <StatusPill label={player.role} tone={roleTone(player.role)} />
                      <StatusPill label={`${player.points} PTS`} tone="success" />
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3">
                  <StatCard label="Goals" value={player.goals} />
                  <StatCard label="Matches" value={player.matches} />
                  <StatCard label="Points" value={player.points} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title="No players have signed in yet"
            description="Once members authenticate and save their profile, their roster cards and photos will appear here."
          />
        )}
      </Panel>
    </div>
  );
}

function roleTone(role: Role) {
  if (role === "Super Admin") return "success";
  if (role === "Admin") return "info";
  if (role === "Captain") return "warning";
  return "neutral";
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[20px] border border-white/8 bg-black/20 px-3 py-4 text-center">
      <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">{label}</p>
      <p className="mt-3 text-2xl font-black text-white">{value}</p>
    </div>
  );
}
