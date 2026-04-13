import type { LeaderboardRow } from "@/lib/types";

type ClubLeaderboardRecord = {
  id: string;
  player_id: string;
  player_name: string;
  player_handle: string;
  club_name: string;
  image_url: string | null;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goals_scored: number;
  goals_conceded: number;
  goal_difference: number | null;
  points: number | null;
};

export const emptyClubLeaderboard: LeaderboardRow[] = [];

export const leaderboardSetupSql = `create extension if not exists pgcrypto;

create table if not exists public.club_leaderboard (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null unique,
  player_name text not null,
  player_handle text not null unique,
  club_name text not null default 'Neon Strikers FC',
  image_url text,
  matches integer not null default 0 check (matches >= 0),
  wins integer not null default 0 check (wins >= 0),
  draws integer not null default 0 check (draws >= 0),
  losses integer not null default 0 check (losses >= 0),
  goals_scored integer not null default 0 check (goals_scored >= 0),
  goals_conceded integer not null default 0 check (goals_conceded >= 0),
  goal_difference integer generated always as (goals_scored - goals_conceded) stored,
  points integer generated always as ((wins * 3) + draws) stored,
  created_at timestamptz not null default now()
);

create index if not exists club_leaderboard_sort_idx
  on public.club_leaderboard (club_name, points desc, goals_scored desc, wins desc);

alter table public.club_leaderboard enable row level security;

drop policy if exists "Authenticated users can read club leaderboard" on public.club_leaderboard;
drop policy if exists "Authenticated users can insert club leaderboard" on public.club_leaderboard;
drop policy if exists "Authenticated users can update club leaderboard" on public.club_leaderboard;

create policy "Authenticated users can read club leaderboard"
on public.club_leaderboard
for select
to authenticated
using (true);

create policy "Authenticated users can insert club leaderboard"
on public.club_leaderboard
for insert
to authenticated
with check (true);

create policy "Authenticated users can update club leaderboard"
on public.club_leaderboard
for update
to authenticated
using (true)
with check (true);`;

export function mapClubLeaderboardRows(records: ClubLeaderboardRecord[]): LeaderboardRow[] {
  return [...records]
    .map((record) => ({
      id: record.id,
      name: record.player_name,
      handle: record.player_handle,
      team: record.club_name,
      position: "Club Member",
      image: record.image_url || "",
      rating: 0,
      matches: record.matches,
      wins: record.wins,
      draws: record.draws,
      losses: record.losses,
      goals: record.goals_scored,
      conceded: record.goals_conceded,
      streak: "",
      points: record.points ?? record.wins * 3 + record.draws,
      goalDifference: record.goal_difference ?? record.goals_scored - record.goals_conceded,
      rank: 0
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goals !== a.goals) return b.goals - a.goals;
      return b.wins - a.wins;
    })
    .map((row, index) => ({
      ...row,
      rank: index + 1
    }));
}
