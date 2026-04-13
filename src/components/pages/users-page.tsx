"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { ShieldCheck, Trash2, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusPill } from "@/components/ui/status-pill";
import { useAuthProfile } from "@/hooks/use-auth-profile";
import { hasPermission } from "@/lib/rbac";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Role } from "@/lib/types";

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  gamer_tag: string | null;
  role: Role | null;
  club_name: string | null;
  created_at: string;
};

export function UsersPage() {
  const { session, profile } = useAuthProfile();
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const canManageUsers = hasPermission(profile.role, "manage:users");

  const loadUsers = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();

    if (!session || !supabase) {
      setUsers([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, gamer_tag, role, club_name, created_at")
      .order("created_at", { ascending: true });

    if (error) {
      setMessage(`Profiles are not available yet. Run full-management-setup.sql. ${error.message}`);
      setUsers([]);
      setLoading(false);
      return;
    }

    setUsers((data ?? []) as ProfileRow[]);
    setMessage("");
    setLoading(false);
  }, [session]);

  const syncUsers = useEffectEvent(() => {
    void loadUsers();
  });

  useEffect(() => {
    syncUsers();
  }, [session]);

  async function promoteUser(id: string, role: Role) {
    if (!canManageUsers) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const { data, error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", id)
      .select("id, role")
      .maybeSingle();

    if (error) {
      setMessage(`Role update failed: ${error.message}`);
      return;
    }

    if (!data) {
      setMessage("Role update failed: the database did not allow the change. Make sure this account is recognized as Super Admin in the profiles table.");
      return;
    }

    setMessage(
      role === "Admin"
        ? "Member promoted to Admin. They can still participate as a player."
        : "Admin access removed. The member stays in the system as a player."
    );
    await loadUsers();
  }

  async function deleteUser(id: string, email: string) {
    if (!canManageUsers) return;

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`Delete ${email} from the entire system? This removes their account, profile, and related access.`);
      if (!confirmed) return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setDeletingUserId(id);

    const { error } = await supabase.rpc("delete_user_account", {
      target_user_id: id
    });

    if (error) {
      if (error.message.includes("Could not find the function public.delete_user_account")) {
        setMessage("User deletion is not enabled in the database yet. Run the updated full-management-setup.sql and try again.");
      } else {
        setMessage(`User delete failed: ${error.message}`);
      }
      setDeletingUserId(null);
      return;
    }

    setMessage("User deleted from the system.");
    setDeletingUserId(null);
    await loadUsers();
  }

  return (
    <div className="space-y-6">
      <Panel className="p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <SectionHeading
            eyebrow="Role directory"
            title="Users & Roles"
            description="Super Admin only grants or removes Admin access. Every Admin is still a normal player account in the club."
          />
          <StatusPill label={canManageUsers ? "Super Admin Access" : "Read Only"} tone={canManageUsers ? "success" : "warning"} />
        </div>
        {message ? (
          <div className="mt-6 rounded-[24px] border border-[#7A5CFF]/25 bg-[#7A5CFF]/10 px-4 py-3 text-sm text-[#E3DAFF]">
            {message}
          </div>
        ) : null}
      </Panel>

      <Panel className="p-6">
        {loading ? (
          <div className="flex min-h-[220px] items-center justify-center rounded-[28px] border border-white/8 bg-black/20 text-sm text-[color:var(--text-muted)]">
            Loading members...
          </div>
        ) : users.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-3">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
                  <th className="px-4">User</th>
                  <th className="px-4">Role</th>
                  <th className="px-4">Club</th>
                  <th className="px-4">Joined</th>
                  <th className="px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="panel rounded-2xl">
                    <td className="rounded-l-2xl px-4 py-4">
                      <p className="font-semibold text-white">
                        {user.gamer_tag || user.full_name || user.email.split("@")[0]}
                      </p>
                      <p className="text-sm text-[color:var(--text-muted)]">{user.email}</p>
                    </td>
                    <td className="px-4 py-4">
                      <StatusPill label={user.role ?? "Player"} tone={roleTone(user.role ?? "Player")} />
                    </td>
                    <td className="px-4 py-4 text-sm text-white">{user.club_name ?? "Neon Strikers FC"}</td>
                    <td className="px-4 py-4 text-sm text-white">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="rounded-r-2xl px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <RoleButton
                          disabled={!canManageUsers || user.role === "Admin" || user.email === "jeflab1077@gmail.com"}
                          onClick={() => void promoteUser(user.id, "Admin")}
                          label="Make Admin"
                        />
                        <RoleButton
                          disabled={
                            !canManageUsers ||
                            user.role === "Player" ||
                            user.email === "jeflab1077@gmail.com"
                          }
                          onClick={() => void promoteUser(user.id, "Player")}
                          label="Dismiss as Admin"
                        />
                        <RoleButton
                          disabled={
                            !canManageUsers ||
                            user.email === "jeflab1077@gmail.com" ||
                            user.id === session?.user.id ||
                            deletingUserId === user.id
                          }
                          onClick={() => void deleteUser(user.id, user.email)}
                          label={deletingUserId === user.id ? "Deleting..." : "Delete User"}
                          tone="danger"
                          icon={Trash2}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title="No members have signed in yet"
            description="This screen stays clean until real users create accounts. Once members authenticate, their profiles and roles will appear here automatically."
          />
        )}
      </Panel>

      <Panel className="p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl border border-[#00FF88]/20 bg-[#00FF88]/10 p-3">
            <ShieldCheck className="h-5 w-5 text-[#00FF88]" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">Current authority</p>
            <h3 className="mt-2 text-xl font-semibold text-white">{profile.role}</h3>
            <p className="mt-3 text-sm leading-6 text-[color:var(--text-muted)]">
              {canManageUsers
                ? "Use the table above to promote users to Admin or return them to Player."
                : "You can review users, but only Super Admin can change roles."}
            </p>
          </div>
        </div>
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

function RoleButton({
  disabled,
  onClick,
  label,
  tone = "default",
  icon: Icon
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
  tone?: "default" | "danger";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
        tone === "danger"
          ? "border-[#FF5470]/25 text-[#FF9BAC]"
          : "border-white/10 text-white"
      }`}
    >
      {Icon ? <Icon className="h-4 w-4" /> : null}
      {label}
    </button>
  );
}
