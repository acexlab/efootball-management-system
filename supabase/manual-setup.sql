create extension if not exists pgcrypto;

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
with check (true);
