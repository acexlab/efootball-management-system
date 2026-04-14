create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('Super Admin', 'Admin', 'Captain', 'Player');
  end if;

  if not exists (select 1 from pg_type where typname = 'tournament_state') then
    create type public.tournament_state as enum ('active', 'completed');
  end if;

  if not exists (select 1 from pg_type where typname = 'tournament_participant_role') then
    create type public.tournament_participant_role as enum ('player', 'captain', 'vice_captain');
  end if;

  if not exists (select 1 from pg_type where typname = 'match_result') then
    create type public.match_result as enum ('win', 'draw', 'loss');
  end if;

  if not exists (select 1 from pg_type where typname = 'lineup_role') then
    create type public.lineup_role as enum ('main', 'sub');
  end if;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  gamer_tag text,
  club_name text not null default 'Shield Esports',
  avatar_url text,
  role public.app_role not null default 'Player',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, gamer_tag, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'user_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url',
    case
      when new.email = 'jeflab1077@gmail.com' then 'Super Admin'::public.app_role
      else 'Player'::public.app_role
    end
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    gamer_tag = excluded.gamer_tag,
    avatar_url = excluded.avatar_url;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'Player'::public.app_role
  );
$$;

create or replace function public.set_user_role(target_user_id uuid, target_role public.app_role)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  target_profile public.profiles;
begin
  if public.current_app_role() <> 'Super Admin' then
    raise exception 'Only Super Admin can change global roles.';
  end if;

  if target_role = 'Captain'::public.app_role then
    raise exception 'Captain is assigned per tournament, not as a global role.';
  end if;

  select *
  into target_profile
  from public.profiles
  where id = target_user_id
  for update;

  if not found then
    raise exception 'Target profile was not found.';
  end if;

  if target_profile.email = 'jeflab1077@gmail.com' and target_role <> 'Super Admin'::public.app_role then
    raise exception 'The primary Super Admin cannot be demoted from the app.';
  end if;

  update public.profiles
  set role = target_role
  where id = target_user_id
  returning * into target_profile;

  return target_profile;
end;
$$;

create or replace function public.delete_user_account(target_user_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_profile public.profiles;
begin
  if public.current_app_role() <> 'Super Admin' then
    raise exception 'Only Super Admin can delete user accounts.';
  end if;

  select *
  into target_profile
  from public.profiles
  where id = target_user_id
  for update;

  if not found then
    raise exception 'Target profile was not found.';
  end if;

  if target_profile.email = 'jeflab1077@gmail.com' then
    raise exception 'The primary Super Admin cannot be deleted.';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot delete your own active account from this screen.';
  end if;

  delete from auth.users
  where id = target_user_id;

  return target_profile;
end;
$$;

create or replace function public.delete_tournament_force(target_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_app_role() not in ('Super Admin', 'Admin') then
    raise exception 'Only Admin and Super Admin can delete tournaments.';
  end if;

  update public.tournaments
  set lifecycle_state = 'active',
      status = 'Ongoing',
      completed_at = null
  where id = target_tournament_id;

  delete from public.tournaments
  where id = target_tournament_id;
end;
$$;

create or replace function public.create_tournament_with_participants(
  tournament_name text,
  tournament_start_date date,
  tournament_end_date date,
  tournament_format text,
  tournament_slot_count integer,
  captain_user_id uuid,
  vice_captain_user_id uuid,
  participant_user_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_tournament_id uuid;
  unique_participants uuid[];
  participant_id uuid;
begin
  if public.current_app_role() not in ('Super Admin', 'Admin') then
    raise exception 'Only Admin and Super Admin can create tournaments.';
  end if;

  unique_participants := array(
    select distinct participant
    from unnest(coalesce(participant_user_ids, array[]::uuid[])) as participant
  );

  if coalesce(array_length(unique_participants, 1), 0) = 0 then
    raise exception 'Select at least one participant.';
  end if;

  if tournament_slot_count <= 0 then
    raise exception 'Slot count must be greater than zero.';
  end if;

  if array_length(unique_participants, 1) < tournament_slot_count then
    raise exception 'Participant count must be at least equal to the slot count.';
  end if;

  if captain_user_id is null or vice_captain_user_id is null then
    raise exception 'Captain and vice-captain must both be selected.';
  end if;

  if captain_user_id = vice_captain_user_id then
    raise exception 'Captain and vice-captain must be different users.';
  end if;

  if not (captain_user_id = any(unique_participants)) or not (vice_captain_user_id = any(unique_participants)) then
    raise exception 'Captain and vice-captain must be part of the selected squad.';
  end if;

  insert into public.tournaments (
    name,
    external_competition,
    format,
    player_count,
    slot_count,
    status,
    lifecycle_state,
    captain_id,
    vice_captain_id,
    created_by,
    start_date,
    end_date
  )
  values (
    tournament_name,
    'Shield Esports Tournament',
    coalesce(nullif(trim(tournament_format), ''), 'Slot Based'),
    array_length(unique_participants, 1),
    tournament_slot_count,
    'Ongoing',
    'active',
    captain_user_id,
    vice_captain_user_id,
    auth.uid(),
    coalesce(tournament_start_date, current_date),
    coalesce(tournament_end_date, coalesce(tournament_start_date, current_date))
  )
  returning id into created_tournament_id;

  foreach participant_id in array unique_participants
  loop
    insert into public.tournament_participants (tournament_id, user_id, role)
    values (
      created_tournament_id,
      participant_id,
      case
        when participant_id = captain_user_id then 'captain'::public.tournament_participant_role
        when participant_id = vice_captain_user_id then 'vice_captain'::public.tournament_participant_role
        else 'player'::public.tournament_participant_role
      end
    );
  end loop;

  insert into public.tournament_teams (tournament_id, name, players_per_team, subs_per_team)
  values (
    created_tournament_id,
    tournament_name || ' Squad',
    tournament_slot_count,
    greatest(array_length(unique_participants, 1) - tournament_slot_count, 0)
  );

  return created_tournament_id;
end;
$$;

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  external_competition text not null default 'Shield Esports Tournament',
  home_team_name text not null default 'Shield Entity',
  format text not null default 'Slot Based',
  player_count integer not null check (player_count > 0),
  slot_count integer not null default 5 check (slot_count > 0),
  status text not null default 'Ongoing',
  lifecycle_state public.tournament_state not null default 'active',
  captain_id uuid references public.profiles(id),
  vice_captain_id uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  start_date date not null default current_date,
  end_date date not null default current_date,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_participants (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.tournament_participant_role not null default 'player',
  created_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);

create table if not exists public.tournament_teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  logo_url text,
  players_per_team integer not null check (players_per_team > 0),
  subs_per_team integer not null default 0 check (subs_per_team >= 0),
  created_at timestamptz not null default now(),
  unique (tournament_id, name)
);

alter table public.tournament_teams
add column if not exists logo_url text;

create table if not exists public.team_players (
  team_id uuid not null references public.tournament_teams(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, player_id)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  match_number integer,
  home_player_id uuid references public.profiles(id),
  away_player_id uuid references public.profiles(id),
  scheduled_at timestamptz,
  venue text,
  opponent_team text,
  status text not null default 'Upcoming',
  lineup_locked boolean not null default false,
  home_score integer not null default 0,
  away_score integer not null default 0,
  walkover boolean not null default false,
  reported_by uuid references public.profiles(id),
  remarks text,
  created_at timestamptz not null default now(),
  unique (tournament_id, match_number)
);

create table if not exists public.match_slots (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  slot_number integer not null check (slot_number > 0),
  player_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (match_id, slot_number),
  unique (match_id, player_id)
);

create table if not exists public.match_lineups (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id uuid not null references public.tournament_teams(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  role public.lineup_role not null,
  created_at timestamptz not null default now(),
  unique (match_id, team_id, player_id)
);

create table if not exists public.match_stats (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.profiles(id),
  goals integer not null default 0 check (goals >= 0),
  opponent_goals integer not null default 0 check (opponent_goals >= 0),
  result public.match_result not null,
  opponent_name text,
  remarks text,
  walkover boolean not null default false,
  created_at timestamptz not null default now(),
  unique (match_id, player_id)
);

alter table public.match_stats
add column if not exists opponent_goals integer not null default 0 check (opponent_goals >= 0);

create table if not exists public.club_leaderboard (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null unique,
  player_name text not null,
  player_handle text not null unique,
  club_name text not null default 'Shield Esports',
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

create index if not exists tournament_participants_tournament_idx
  on public.tournament_participants (tournament_id, role);

create index if not exists tournament_teams_tournament_idx
  on public.tournament_teams (tournament_id);

create index if not exists team_players_team_idx
  on public.team_players (team_id, player_id);

create index if not exists matches_tournament_idx
  on public.matches (tournament_id, match_number);

create index if not exists match_slots_match_idx
  on public.match_slots (match_id, slot_number);

create index if not exists match_stats_match_idx
  on public.match_stats (match_id, player_id);

create index if not exists match_lineups_match_team_idx
  on public.match_lineups (match_id, team_id, role);

create index if not exists club_leaderboard_sort_idx
  on public.club_leaderboard (club_name, points desc, goals_scored desc, wins desc);

create or replace function public.tournament_is_open(target_tournament uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select lifecycle_state = 'active' from public.tournaments where id = target_tournament),
    false
  );
$$;

create or replace function public.can_manage_tournament(target_tournament uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_app_role() in ('Super Admin', 'Admin')
    or exists (
      select 1
      from public.tournament_participants tp
      where tp.tournament_id = target_tournament
        and tp.user_id = auth.uid()
        and tp.role in ('captain', 'vice_captain')
    );
$$;

create or replace function public.match_player_in_slots(target_match uuid, target_player uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.match_slots
    where match_id = target_match
      and player_id = target_player
  );
$$;

create or replace function public.team_player_exists(target_team uuid, target_player uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_players
    where team_id = target_team
      and player_id = target_player
  );
$$;

create or replace function public.prevent_completed_tournament_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_tournament uuid;
begin
  if public.current_app_role() in ('Super Admin', 'Admin') then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'tournament_participants' then
    target_tournament := coalesce(new.tournament_id, old.tournament_id);
  elsif tg_table_name = 'matches' then
    target_tournament := coalesce(new.tournament_id, old.tournament_id);
  elsif tg_table_name = 'match_slots' then
    select m.tournament_id into target_tournament
    from public.matches m
    where m.id = coalesce(new.match_id, old.match_id);
  elsif tg_table_name = 'match_stats' then
    select m.tournament_id into target_tournament
    from public.matches m
    where m.id = coalesce(new.match_id, old.match_id);
  elsif tg_table_name = 'tournament_teams' then
    target_tournament := coalesce(new.tournament_id, old.tournament_id);
  elsif tg_table_name = 'team_players' then
    select tt.tournament_id into target_tournament
    from public.tournament_teams tt
    where tt.id = coalesce(new.team_id, old.team_id);
  elsif tg_table_name = 'match_lineups' then
    select tt.tournament_id into target_tournament
    from public.tournament_teams tt
    where tt.id = coalesce(new.team_id, old.team_id);
  end if;

  if target_tournament is not null and not public.tournament_is_open(target_tournament) then
    raise exception 'Tournament is completed and can no longer be changed.';
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.ensure_match_lineup_player_belongs_to_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.team_player_exists(new.team_id, new.player_id) then
    raise exception 'Lineup players must belong to the selected team.';
  end if;

  return new;
end;
$$;

create or replace function public.ensure_match_stats_use_final_slots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.match_player_in_slots(new.match_id, new.player_id) then
    raise exception 'Stats can only be recorded for players in the final match slots.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_completed_tournament_participant_changes on public.tournament_participants;
create trigger prevent_completed_tournament_participant_changes
before insert or update or delete on public.tournament_participants
for each row execute procedure public.prevent_completed_tournament_changes();

drop trigger if exists prevent_completed_match_changes on public.matches;
create trigger prevent_completed_match_changes
before update or delete on public.matches
for each row execute procedure public.prevent_completed_tournament_changes();

drop trigger if exists prevent_completed_tournament_team_changes on public.tournament_teams;
create trigger prevent_completed_tournament_team_changes
before insert or update or delete on public.tournament_teams
for each row execute procedure public.prevent_completed_tournament_changes();

drop trigger if exists prevent_completed_team_player_changes on public.team_players;
create trigger prevent_completed_team_player_changes
before insert or update or delete on public.team_players
for each row execute procedure public.prevent_completed_tournament_changes();

drop trigger if exists prevent_completed_match_slot_changes on public.match_slots;
create trigger prevent_completed_match_slot_changes
before insert or update or delete on public.match_slots
for each row execute procedure public.prevent_completed_tournament_changes();

drop trigger if exists prevent_completed_match_stat_changes on public.match_stats;
create trigger prevent_completed_match_stat_changes
before insert or update or delete on public.match_stats
for each row execute procedure public.prevent_completed_tournament_changes();

drop trigger if exists ensure_match_stats_use_final_slots_trigger on public.match_stats;
create trigger ensure_match_stats_use_final_slots_trigger
before insert or update on public.match_stats
for each row execute procedure public.ensure_match_stats_use_final_slots();

drop trigger if exists prevent_completed_match_lineup_changes on public.match_lineups;
create trigger prevent_completed_match_lineup_changes
before insert or update or delete on public.match_lineups
for each row execute procedure public.prevent_completed_tournament_changes();

drop trigger if exists ensure_match_lineup_player_belongs_to_team_trigger on public.match_lineups;
create trigger ensure_match_lineup_player_belongs_to_team_trigger
before insert or update on public.match_lineups
for each row execute procedure public.ensure_match_lineup_player_belongs_to_team();

create or replace view public.tournament_leaderboard as
select
  tp.tournament_id,
  tp.user_id as player_id,
  p.full_name,
  p.gamer_tag,
  count(ms.id) as matches_played,
  coalesce(sum(case when ms.result = 'win' then 1 else 0 end), 0) as wins,
  coalesce(sum(case when ms.result = 'draw' then 1 else 0 end), 0) as draws,
  coalesce(sum(case when ms.result = 'loss' then 1 else 0 end), 0) as losses,
  coalesce(sum(ms.goals), 0) as goals,
  coalesce(sum(case when ms.result = 'win' then 3 when ms.result = 'draw' then 1 else 0 end), 0) as points
from public.tournament_participants tp
join public.profiles p on p.id = tp.user_id
left join public.match_stats ms
  on ms.player_id = tp.user_id
 and ms.match_id in (
   select m.id
   from public.matches m
   where m.tournament_id = tp.tournament_id
 )
group by tp.tournament_id, tp.user_id, p.full_name, p.gamer_tag;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update
set public = excluded.public;

alter table public.profiles enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_participants enable row level security;
alter table public.tournament_teams enable row level security;
alter table public.team_players enable row level security;
alter table public.matches enable row level security;
alter table public.match_slots enable row level security;
alter table public.match_stats enable row level security;
alter table public.match_lineups enable row level security;
alter table public.club_leaderboard enable row level security;

drop policy if exists "Authenticated users can read profiles" on public.profiles;
drop policy if exists "Users can update own profile or super admin can manage all profiles" on public.profiles;
drop policy if exists "Authenticated users can read tournaments" on public.tournaments;
drop policy if exists "Admins manage tournaments" on public.tournaments;
drop policy if exists "Authenticated users can read tournament participants" on public.tournament_participants;
drop policy if exists "Admins manage tournament participants" on public.tournament_participants;
drop policy if exists "Authenticated users can read tournament teams" on public.tournament_teams;
drop policy if exists "Tournament managers control tournament teams" on public.tournament_teams;
drop policy if exists "Authenticated users can read team players" on public.team_players;
drop policy if exists "Tournament managers control team players" on public.team_players;
drop policy if exists "Authenticated users can read matches" on public.matches;
drop policy if exists "Tournament managers control matches" on public.matches;
drop policy if exists "Authenticated users can read match slots" on public.match_slots;
drop policy if exists "Tournament managers control match slots" on public.match_slots;
drop policy if exists "Authenticated users can read match stats" on public.match_stats;
drop policy if exists "Tournament managers control match stats" on public.match_stats;
drop policy if exists "Authenticated users can read match lineups" on public.match_lineups;
drop policy if exists "Tournament managers control match lineups" on public.match_lineups;
drop policy if exists "Authenticated users can read club leaderboard" on public.club_leaderboard;
drop policy if exists "Authenticated users can insert club leaderboard" on public.club_leaderboard;
drop policy if exists "Authenticated users can update club leaderboard" on public.club_leaderboard;
drop policy if exists "Avatar images are publicly readable" on storage.objects;
drop policy if exists "Authenticated users can upload own avatar" on storage.objects;
drop policy if exists "Authenticated users can update own avatar" on storage.objects;
drop policy if exists "Authenticated users can delete own avatar" on storage.objects;

create policy "Authenticated users can read profiles"
on public.profiles
for select
to authenticated
using (true);

create policy "Users can update own profile or super admin can manage all profiles"
on public.profiles
for update
to authenticated
using (auth.uid() = id or public.current_app_role() = 'Super Admin')
with check (auth.uid() = id or public.current_app_role() = 'Super Admin');

create policy "Authenticated users can read tournaments"
on public.tournaments
for select
to authenticated
using (true);

create policy "Admins manage tournaments"
on public.tournaments
for all
to authenticated
using (public.current_app_role() in ('Super Admin', 'Admin'))
with check (public.current_app_role() in ('Super Admin', 'Admin'));

create policy "Authenticated users can read tournament participants"
on public.tournament_participants
for select
to authenticated
using (true);

create policy "Admins manage tournament participants"
on public.tournament_participants
for all
to authenticated
using (
  public.current_app_role() in ('Super Admin', 'Admin')
  and public.tournament_is_open(tournament_id)
)
with check (
  public.current_app_role() in ('Super Admin', 'Admin')
  and public.tournament_is_open(tournament_id)
);

create policy "Authenticated users can read tournament teams"
on public.tournament_teams
for select
to authenticated
using (true);

create policy "Tournament managers control tournament teams"
on public.tournament_teams
for all
to authenticated
using (
  public.can_manage_tournament(tournament_id)
  and public.tournament_is_open(tournament_id)
)
with check (
  public.can_manage_tournament(tournament_id)
  and public.tournament_is_open(tournament_id)
);

create policy "Authenticated users can read team players"
on public.team_players
for select
to authenticated
using (true);

create policy "Tournament managers control team players"
on public.team_players
for all
to authenticated
using (
  public.can_manage_tournament(
    (select tt.tournament_id from public.tournament_teams tt where tt.id = team_id)
  )
  and public.tournament_is_open(
    (select tt.tournament_id from public.tournament_teams tt where tt.id = team_id)
  )
)
with check (
  public.can_manage_tournament(
    (select tt.tournament_id from public.tournament_teams tt where tt.id = team_id)
  )
  and public.tournament_is_open(
    (select tt.tournament_id from public.tournament_teams tt where tt.id = team_id)
  )
);

create policy "Authenticated users can read matches"
on public.matches
for select
to authenticated
using (true);

create policy "Tournament managers control matches"
on public.matches
for all
to authenticated
using (
  public.can_manage_tournament(tournament_id)
  and public.tournament_is_open(tournament_id)
)
with check (
  public.can_manage_tournament(tournament_id)
  and public.tournament_is_open(tournament_id)
);

create policy "Authenticated users can read match slots"
on public.match_slots
for select
to authenticated
using (true);

create policy "Tournament managers control match slots"
on public.match_slots
for all
to authenticated
using (
  public.can_manage_tournament(
    (select m.tournament_id from public.matches m where m.id = match_id)
  )
  and public.tournament_is_open(
    (select m.tournament_id from public.matches m where m.id = match_id)
  )
)
with check (
  public.can_manage_tournament(
    (select m.tournament_id from public.matches m where m.id = match_id)
  )
  and public.tournament_is_open(
    (select m.tournament_id from public.matches m where m.id = match_id)
  )
);

create policy "Authenticated users can read match stats"
on public.match_stats
for select
to authenticated
using (true);

create policy "Tournament managers control match stats"
on public.match_stats
for all
to authenticated
using (
  public.can_manage_tournament(
    (select m.tournament_id from public.matches m where m.id = match_id)
  )
  and public.tournament_is_open(
    (select m.tournament_id from public.matches m where m.id = match_id)
  )
)
with check (
  public.can_manage_tournament(
    (select m.tournament_id from public.matches m where m.id = match_id)
  )
  and public.tournament_is_open(
    (select m.tournament_id from public.matches m where m.id = match_id)
  )
);

create policy "Authenticated users can read match lineups"
on public.match_lineups
for select
to authenticated
using (true);

create policy "Tournament managers control match lineups"
on public.match_lineups
for all
to authenticated
using (
  public.can_manage_tournament(
    (select m.tournament_id from public.matches m where m.id = match_id)
  )
  and public.tournament_is_open(
    (select m.tournament_id from public.matches m where m.id = match_id)
  )
)
with check (
  public.can_manage_tournament(
    (select m.tournament_id from public.matches m where m.id = match_id)
  )
  and public.tournament_is_open(
    (select m.tournament_id from public.matches m where m.id = match_id)
  )
);

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

create policy "Avatar images are publicly readable"
on storage.objects
for select
to public
using (bucket_id = 'avatars');

create policy "Authenticated users can upload own avatar"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Authenticated users can update own avatar"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Authenticated users can delete own avatar"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

grant execute on function public.set_user_role(uuid, public.app_role) to authenticated;
grant execute on function public.delete_user_account(uuid) to authenticated;
grant execute on function public.delete_tournament_force(uuid) to authenticated;
grant execute on function public.create_tournament_with_participants(text, date, date, text, integer, uuid, uuid, uuid[]) to authenticated;

update public.profiles
set role = 'Super Admin'
where email = 'jeflab1077@gmail.com';
