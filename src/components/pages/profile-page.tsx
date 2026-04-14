"use client";

import { FormEvent, useCallback, useEffect, useEffectEvent, useState } from "react";
import { UserCircle2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useAuthProfile } from "@/hooks/use-auth-profile";
import { syncClubLeaderboardFromStats } from "@/lib/supabase/club-operations";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function ProfilePage() {
  const { session, profile } = useAuthProfile();
  const [draft, setDraft] = useState({
    fullName: undefined as string | undefined,
    gamerTag: undefined as string | undefined,
    clubName: undefined as string | undefined,
    avatarUrl: undefined as string | undefined
  });
  const [stats, setStats] = useState({
    goals: 0,
    matches: 0,
    points: 0,
    rank: 0
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const loadProfileStats = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();

    if (!supabase || !session) {
      setStats({ goals: 0, matches: 0, points: 0, rank: 0 });
      return;
    }

    const { data } = await supabase
      .from("club_leaderboard")
      .select("player_id, player_handle, goals_scored, matches, points")
      .eq("player_handle", profile.handle)
      .maybeSingle();

    if (!data) {
      setStats({ goals: 0, matches: 0, points: 0, rank: 0 });
      return;
    }

    setStats({
      goals: data.goals_scored,
      matches: data.matches,
      points: data.points,
      rank: 0
    });
  }, [profile.handle, session]);

  const syncProfileStats = useEffectEvent(() => {
    void loadProfileStats();
  });

  useEffect(() => {
    syncProfileStats();
  }, [session, profile.handle]);

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const supabase = getSupabaseBrowserClient();
    if (!supabase || !session) {
      setMessage("Sign in first to update your player identity.");
      return;
    }

    setSaving(true);
    setMessage("");

    const payload = {
      full_name: (draft.fullName ?? profile.name).trim(),
      gamer_tag: (draft.gamerTag ?? profile.handle).trim(),
      club_name: (draft.clubName ?? profile.club).trim(),
      avatar_url: (draft.avatarUrl ?? profile.image).trim()
    };

    const { error } = await supabase.from("profiles").update(payload).eq("id", session.user.id);

    if (error) {
      setMessage(`Profile update failed: ${error.message}`);
      setSaving(false);
      return;
    }

    await supabase.auth.updateUser({
      data: {
        full_name: payload.full_name,
        user_name: payload.gamer_tag,
        avatar_url: payload.avatar_url
      }
    });

    try {
      await syncClubLeaderboardFromStats(supabase);
    } catch {
      setMessage("Profile updated, but leaderboard identity refresh did not complete.");
      setSaving(false);
      return;
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("efcms:profile-updated"));
    }

    setMessage("Profile updated.");
    setSaving(false);
  }

  async function handleAvatarUpload(file: File | null) {
    if (!file) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase || !session) {
      setMessage("Sign in first to upload a player photo.");
      return;
    }

    setUploading(true);
    setMessage("");

    const extension = file.name.split(".").pop() || "jpg";
    const path = `${session.user.id}/avatar-${Date.now()}.${extension}`;

    const { error } = await supabase.storage.from("avatars").upload(path, file, {
      upsert: true,
      cacheControl: "3600"
    });

    if (error) {
      setMessage(`Photo upload failed: ${error.message}`);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const publicUrl = data.publicUrl;

    // Immediately update database with new avatar URL
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("id", session.user.id);

    if (updateError) {
      setMessage(`Photo uploaded but database update failed: ${updateError.message}`);
      setUploading(false);
      return;
    }

    // Update auth metadata
    await supabase.auth.updateUser({
      data: { avatar_url: publicUrl }
    });

    // Update local UI state
    setDraft((state) => ({ ...state, avatarUrl: publicUrl }));
    
    // Trigger profile refresh event to update all components immediately
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("efcms:profile-updated"));
    }

    setMessage("Photo updated successfully!");
    setUploading(false);
  }

  const displayName = draft.fullName ?? profile.name;
  const displayHandle = draft.gamerTag ?? profile.handle;
  const displayClub = draft.clubName ?? profile.club;
  const displayImage = draft.avatarUrl ?? profile.image;

  return (
    <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <Panel className="overflow-hidden p-0">
        <div className="relative min-h-[500px] overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(0,255,136,0.18),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(122,92,255,0.18),transparent_30%),linear-gradient(180deg,#111720_0%,#0B0F14_100%)] p-6">
          <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="relative flex h-full flex-col justify-between">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#9eeed0]">{displayClub}</p>
                <h2
                  className="mt-3 text-4xl font-black uppercase tracking-[0.12em] text-white"
                  style={{ fontFamily: "\"Orbitron\", sans-serif" }}
                >
                  {displayName}
                </h2>
                <p className="mt-2 text-lg text-[#d3dfeb]">@{displayHandle}</p>
              </div>
              <UserAvatar src={displayImage} name={displayName} className="h-28 w-28 rounded-[28px]" />
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/30 p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">Account identity</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Info label="Role" value={profile.role} />
                <Info label="Email" value={profile.email || "Add after first sign-in"} />
                <Info label="Club" value={displayClub} />
                <Info label="Avatar" value={displayImage ? "Connected" : "Fallback initials"} />
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <div className="space-y-6">
        <Panel className="p-6">
          <SectionHeading
            eyebrow="Player profile"
            title="Performance Card"
            description="This panel stays grounded in real account data. Competitive stats appear only after actual results are recorded."
          />
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Stat label="Goals" value={stats.goals} />
            <Stat label="Matches" value={stats.matches} />
            <Stat label="Points" value={stats.points} />
            <Stat label="Role Rank" value={stats.rank} />
          </div>
        </Panel>

        <Panel className="p-6">
          <SectionHeading
            eyebrow="Identity settings"
            title="Edit Profile"
            description="Players can set their real name, in-game name, club label, and avatar link from here."
          />
          {session ? (
            <form className="mt-6 space-y-4" onSubmit={handleSaveProfile}>
                <Field
                  label="Real name"
                  value={draft.fullName ?? profile.name}
                  onChange={(value) => setDraft((state) => ({ ...state, fullName: value }))}
                  placeholder="Your full name"
                />
                <Field
                  label="In-game name"
                  value={draft.gamerTag ?? profile.handle}
                  onChange={(value) => setDraft((state) => ({ ...state, gamerTag: value }))}
                  placeholder="Your gamer tag"
                />
                <Field
                  label="Club name"
                  value={draft.clubName ?? profile.club}
                  onChange={(value) => setDraft((state) => ({ ...state, clubName: value }))}
                  placeholder="Club name"
                />
                <Field
                  label="Avatar URL"
                  value={draft.avatarUrl ?? profile.image}
                  onChange={(value) => setDraft((state) => ({ ...state, avatarUrl: value }))}
                  placeholder="https://..."
                />
                <label className="space-y-2">
                  <span className="text-sm text-[color:var(--text-muted)]">Upload player photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => void handleAvatarUpload(event.target.files?.[0] ?? null)}
                    className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition file:mr-4 file:rounded-xl file:border-0 file:bg-[#00FF88]/12 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[#00FF88]"
                  />
                </label>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={saving || uploading}
                  className="rounded-2xl border border-[#00FF88]/30 bg-[#00FF88]/12 px-5 py-3 font-semibold text-[#00FF88] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving..." : uploading ? "Uploading..." : "Save Profile"}
                </button>
                <p className="text-sm text-[color:var(--text-muted)]">
                  These details are used across the dashboard, lineup views, and account shell.
                </p>
              </div>
              {message ? (
                <div className="rounded-2xl border border-[#00D4FF]/20 bg-[#00D4FF]/10 px-4 py-3 text-sm text-[#C5F5FF]">
                  {message}
                </div>
              ) : null}
            </form>
          ) : (
            <EmptyState
              icon={UserCircle2}
              title="Sign in to load your player profile"
              description="This page becomes personal after authentication, letting you manage your own player identity."
            />
          )}
        </Panel>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">{label}</p>
      <p className="mt-3 text-3xl font-black text-white">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--text-muted)]">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm text-[color:var(--text-muted)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-[#00D4FF]/30"
      />
    </label>
  );
}
