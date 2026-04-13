import { currentUser } from "@/lib/data";
import type { Role, UserProfile } from "@/lib/types";

export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  "Super Admin": [
    "manage:all",
    "manage:users",
    "assign:roles",
    "manage:tournaments",
    "assign:players",
    "generate:fixtures",
    "enter:results",
    "reset:system",
    "view:reports",
    "view:all"
  ],
  Admin: [
    "manage:tournaments",
    "assign:captain",
    "assign:players",
    "generate:fixtures",
    "enter:results",
    "view:reports",
    "view:all"
  ],
  Captain: ["enter:results", "update:performance", "view:assigned-tournaments", "view:all"],
  Player: ["view:leaderboard", "view:profile", "view:history", "view:all"]
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  "Super Admin": "Owns the whole platform, promotes users, and controls system-level operations.",
  Admin: "Runs tournaments, selects the squad, assigns tournament captains, and updates match outcomes.",
  Captain: "Legacy global captain role. Active captain control is now assigned per tournament.",
  Player: "Maintains a profile and views leaderboard, stats, and match history with no edit rights."
};

export function hasPermission(role: Role, permission: string) {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function resolveRoleFromEmail(email?: string | null): Role {
  if (!email) return currentUser.role;

  if (email.toLowerCase() === "jeflab1077@gmail.com") return "Super Admin";

  return "Player";
}

export function resolveUserProfile(email?: string | null): UserProfile {
  if (!email) return currentUser;

  const [namePart] = email.split("@");
  return {
    ...currentUser,
    name: namePart,
    handle: namePart.slice(0, 14),
    email,
    role: resolveRoleFromEmail(email)
  };
}
