-- Canonical copy: deployed from the linked Try Jesus Journey repository.
-- Keep this file in sync with tryjesusjourney/supabase/migrations/20260911150000_journey_rewards.sql.

create table if not exists public.journey_reward_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  alias text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  alias_changed_at timestamptz,
  constraint journey_reward_profiles_alias_length
    check (char_length(alias) between 3 and 40)
);

create unique index if not exists journey_reward_profiles_alias_unique
  on public.journey_reward_profiles (lower(alias));

alter table public.journey_reward_profiles enable row level security;
revoke all on table public.journey_reward_profiles from anon, authenticated;

create or replace function public.journey_alias_from_seed(p_seed text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  seed_bytes bytea := pg_catalog.decode(pg_catalog.md5(coalesce(p_seed, '')), 'hex');
  adjectives constant text[] := array[
    'Bright', 'Calm', 'Caring', 'Cheerful', 'Courageous', 'Curious',
    'Gentle', 'Grateful', 'Hopeful', 'Joyful', 'Kind', 'Patient',
    'Peaceful', 'Radiant', 'Steady', 'Thoughtful'
  ];
  nouns constant text[] := array[
    'Cedar', 'Dove', 'Garden', 'Harbor', 'Lamp', 'Meadow', 'Morning', 'Olive',
    'Path', 'River', 'Sparrow', 'Star', 'Vine', 'Willow', 'Wren', 'Brook'
  ];
  adjective_index integer;
  noun_index integer;
  suffix_number bigint;
begin
  adjective_index := (pg_catalog.get_byte(seed_bytes, 0) % pg_catalog.array_length(adjectives, 1)) + 1;
  noun_index := (pg_catalog.get_byte(seed_bytes, 1) % pg_catalog.array_length(nouns, 1)) + 1;
  suffix_number := (
    pg_catalog.get_byte(seed_bytes, 2)::bigint * 16777216
    + pg_catalog.get_byte(seed_bytes, 3)::bigint * 65536
    + pg_catalog.get_byte(seed_bytes, 4)::bigint * 256
    + pg_catalog.get_byte(seed_bytes, 5)::bigint
  ) % 1000000;

  return adjectives[adjective_index] || ' ' || nouns[noun_index] || ' '
    || pg_catalog.lpad(suffix_number::text, 6, '0');
end;
$$;

revoke all on function public.journey_alias_from_seed(text) from public;

create or replace function public.journey_ensure_profile_for_user(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_alias text;
  candidate_alias text;
  attempt integer := 0;
begin
  select profile.alias into existing_alias
  from public.journey_reward_profiles as profile
  where profile.user_id = p_user_id;

  if existing_alias is not null then return existing_alias; end if;

  loop
    candidate_alias := public.journey_alias_from_seed(p_user_id::text || ':' || attempt::text);
    begin
      insert into public.journey_reward_profiles (user_id, alias) values (p_user_id, candidate_alias);
      return candidate_alias;
    exception when unique_violation then
      select profile.alias into existing_alias
      from public.journey_reward_profiles as profile
      where profile.user_id = p_user_id;
      if existing_alias is not null then return existing_alias; end if;
      attempt := attempt + 1;
      if attempt >= 30 then raise exception 'Could not create a unique Journey alias'; end if;
    end;
  end loop;
end;
$$;

revoke all on function public.journey_ensure_profile_for_user(uuid) from public;

create or replace function public.journey_create_profile_after_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.journey_ensure_profile_for_user(new.id);
  return new;
end;
$$;

revoke all on function public.journey_create_profile_after_signup() from public;

drop trigger if exists create_journey_reward_profile_after_signup on auth.users;
create trigger create_journey_reward_profile_after_signup
  after insert on auth.users
  for each row execute function public.journey_create_profile_after_signup();

select public.journey_ensure_profile_for_user(account.id) from auth.users as account;

create or replace function public.ensure_journey_profile()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Sign in to join the Journey leaderboard'; end if;
  return public.journey_ensure_profile_for_user(current_user_id);
end;
$$;

revoke all on function public.ensure_journey_profile() from public;
grant execute on function public.ensure_journey_profile() to authenticated;

create or replace function public.reroll_journey_alias()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  last_changed timestamptz;
  candidate_alias text;
  attempt integer := 0;
begin
  if current_user_id is null then raise exception 'Sign in to change your Journey alias'; end if;
  perform public.journey_ensure_profile_for_user(current_user_id);
  select profile.alias_changed_at into last_changed
  from public.journey_reward_profiles as profile where profile.user_id = current_user_id;
  if last_changed is not null and last_changed > pg_catalog.clock_timestamp() - interval '10 seconds' then
    raise exception 'Please wait a few seconds before choosing another alias';
  end if;
  loop
    candidate_alias := public.journey_alias_from_seed(current_user_id::text || ':' || pg_catalog.clock_timestamp()::text || ':' || pg_catalog.random()::text || ':' || attempt::text);
    begin
      update public.journey_reward_profiles
      set alias = candidate_alias, updated_at = pg_catalog.clock_timestamp(), alias_changed_at = pg_catalog.clock_timestamp()
      where user_id = current_user_id;
      return candidate_alias;
    exception when unique_violation then
      attempt := attempt + 1;
      if attempt >= 30 then raise exception 'Could not create a unique Journey alias'; end if;
    end;
  end loop;
end;
$$;

revoke all on function public.reroll_journey_alias() from public;
grant execute on function public.reroll_journey_alias() to authenticated;

create or replace function public.get_journey_leaderboard()
returns table ("rank" bigint, alias text, journey_points integer, completed_chapters integer, is_current_user boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with player_scores as (
    select profile.user_id, profile.alias,
      coalesce(score.completed_chapters, 0)::integer as completed_chapters
    from public.journey_reward_profiles as profile
    left join public.reading_plan_progress as progress
      on progress.user_id = profile.user_id and progress.plan_id = 'chronological-bible-order-v4'
    left join lateral (
      select pg_catalog.count(distinct completed_index)::integer as completed_chapters
      from pg_catalog.unnest(coalesce(progress.completed_indices, array[]::integer[])) as completed(completed_index)
      where completed_index between 0 and 1204
    ) as score on true
  ), ranked_players as (
    select pg_catalog.dense_rank() over (order by player.completed_chapters desc) as player_rank,
      player.user_id, player.alias, player.completed_chapters
    from player_scores as player
  )
  select player.player_rank as "rank", player.alias,
    player.completed_chapters * 10 as journey_points, player.completed_chapters,
    player.user_id = auth.uid() as is_current_user
  from ranked_players as player
  order by player.player_rank, pg_catalog.lower(player.alias);
$$;

revoke all on function public.get_journey_leaderboard() from public;
revoke all on function public.get_journey_leaderboard() from anon;
grant execute on function public.get_journey_leaderboard() to authenticated;

comment on table public.journey_reward_profiles is 'Alias-only profiles for the chronological Bible Journey Points leaderboard.';
comment on function public.get_journey_leaderboard() is 'Returns only rank, random alias, derived Journey Points, completed chapter count, and caller marker.';
