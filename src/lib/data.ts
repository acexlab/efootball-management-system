import type { UserProfile, WorkflowStep } from "@/lib/types";

export const currentUser: UserProfile = {
  id: "local-user",
  name: "Club User",
  handle: "member",
  email: "",
  role: "Player",
  club: "Neon Strikers FC",
  image: "",
  notifications: 0
};

export const workflowSteps: WorkflowStep[] = [
  {
    step: "01",
    title: "User Registration",
    description: "Users sign up with email or Google and enter the system as Players by default."
  },
  {
    step: "02",
    title: "Role Assignment",
    description: "Super Admin promotes selected accounts to Admin and maintains global control."
  },
  {
    step: "03",
    title: "Tournament Creation",
    description: "Admin or Super Admin creates an internal tournament, sets slot count, and assigns captain plus vice-captain."
  },
  {
    step: "04",
    title: "Player Assignment",
    description: "Admin selects which players will participate in each tournament."
  },
  {
    step: "05",
    title: "Fixture Generation",
    description: "The system builds matchups such as Player 1 vs Player 2 and Player 3 vs Player 4."
  },
  {
    step: "06",
    title: "Result Entry",
    description: "Admin, tournament captain, or vice-captain submits goals, result, walkover, and remarks after each fixture."
  },
  {
    step: "07",
    title: "Leaderboard Update",
    description: "Rankings auto-sort by points, then goal difference, then goals scored."
  },
  {
    step: "08",
    title: "Public Display",
    description: "The landing page surfaces leaderboard, top players, recent results, and ongoing tournaments."
  }
];

export const roleActionPlans = {
  "Super Admin": [
    "Promote registered users to Admin",
    "Review all tournaments, matches, and reports",
    "Control system-wide resets and access policy changes"
  ],
  Admin: [
    "Create tournaments and assign captain plus vice-captain",
    "Add players to tournament squads and generate fixtures",
    "Enter or update results and monitor reports"
  ],
  Captain: [
    "Legacy global captain role retained for older accounts",
    "Live captain control now comes from tournament assignment",
    "Coordinate with Admin on remarks and walkovers"
  ],
  Player: [
    "Manage profile and view leaderboard",
    "Review match history and performance stats",
    "Track ongoing tournaments without edit access"
  ]
} as const;
