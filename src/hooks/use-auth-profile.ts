"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";
import type { Role, UserProfile } from "@/lib/types";
import { useSupabaseSession } from "@/hooks/use-supabase-session";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { resolveRoleFromEmail, resolveUserProfile } from "@/lib/rbac";

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  gamer_tag: string | null;
  role: Role | null;
  avatar_url: string | null;
  club_name: string | null;
};

export function useAuthProfile() {
  const { session, loading: sessionLoading } = useSupabaseSession();
  const [dbProfile, setDbProfile] = useState<ProfileRow | null>(null);

  const loadDbProfile = useCallback(async (userId?: string): Promise<ProfileRow | null> => {
    if (!userId) return null;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return null;

    const { data } = await supabase
      .from("profiles")
      .select("id, email, full_name, gamer_tag, role, avatar_url, club_name")
      .eq("id", userId)
      .maybeSingle();

    return (data as ProfileRow | null) ?? null;
  }, []);

  const syncProfile = useEffectEvent(async () => {
    if (!session?.user?.id) return;
    const data = await loadDbProfile(session.user.id);
    setDbProfile(data);
  });

  useEffect(() => {
    if (!session?.user?.id) return;
    syncProfile();
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id || typeof window === "undefined") return;

    const handleFocus = () => {
      syncProfile();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    const interval = window.setInterval(() => {
      syncProfile();
    }, 15000);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
      window.clearInterval(interval);
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleRefresh = () => {
      syncProfile();
    };

    window.addEventListener("efcms:profile-updated", handleRefresh);
    return () => {
      window.removeEventListener("efcms:profile-updated", handleRefresh);
    };
  }, []);

  const baseProfile = resolveUserProfile(session?.user.email);

  const profile: UserProfile = {
    ...baseProfile,
    id: dbProfile?.id ?? baseProfile.id,
    email: dbProfile?.email ?? session?.user.email ?? baseProfile.email,
    name:
      dbProfile?.full_name ??
      (session?.user.user_metadata?.full_name as string | undefined) ??
      baseProfile.name,
    handle:
      dbProfile?.gamer_tag ??
      (session?.user.user_metadata?.user_name as string | undefined) ??
      baseProfile.handle,
    role: dbProfile?.role ?? resolveRoleFromEmail(session?.user.email),
    club: dbProfile?.club_name ?? baseProfile.club,
    image:
      dbProfile?.avatar_url ??
      (session?.user.user_metadata?.avatar_url as string | undefined) ??
      baseProfile.image
  };

  return {
    session,
    profile,
    loading: sessionLoading
  };
}
