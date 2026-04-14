export type Role = "Super Admin" | "Admin" | "Captain" | "Player";
export type UserStatus = "Active" | "Invited" | "Suspended";

export type TournamentStatus = "Ongoing" | "Upcoming" | "Completed";
export type MatchStatus = "Live" | "Upcoming" | "Completed";
export type MatchResult = "Win" | "Loss" | "Draw";
export type TournamentParticipantRole = "player" | "captain" | "vice_captain";
export type LineupRole = "main" | "sub";

export type Player = {
  id: string;
  name: string;
  handle: string;
  team: string;
  position: string;
  image: string;
  rating: number;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  conceded: number;
  streak: string;
};

export type Tournament = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  players: number;
  status: TournamentStatus;
  lifecycleState?: "active" | "completed";
  format: string;
  slotCount?: number;
  captainId?: string;
  viceCaptainId?: string;
  playerIds?: string[];
  createdBy?: string;
  externalCompetition?: string;
  canDelete?: boolean;
};

export type TournamentTeam = {
  id: string;
  tournamentId: string;
  name: string;
  playersPerTeam: number;
  subsPerTeam: number;
};

export type PlayerOption = {
  id: string;
  name: string;
  role: Role;
  avatarUrl?: string;
};

export type ClubMatch = {
  id: string;
  tournamentId?: string;
  matchNumber?: number;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  date: string;
  status: MatchStatus;
  venue: string;
  tournament: string;
  slots?: string[];
  canDelete?: boolean;
};

export type UserProfile = {
  id?: string;
  name: string;
  handle: string;
  email?: string;
  role: Role;
  club: string;
  image: string;
  notifications: number;
};

export type SystemUser = UserProfile & {
  id: string;
  email: string;
  status: UserStatus;
  managedTournaments: number;
  assignedTournaments: number;
  lastSeen: string;
};

export type LeaderboardRow = Player & {
  points: number;
  goalDifference: number;
  rank: number;
};

export type WorkflowStep = {
  step: string;
  title: string;
  description: string;
};
