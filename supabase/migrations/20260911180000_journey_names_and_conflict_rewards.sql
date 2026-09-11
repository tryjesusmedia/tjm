-- Private first names plus an alias-only Bible/Conflict leaderboard.
-- first_name is never returned by either public leaderboard RPC.

create or replace function public.journey_first_name_from_metadata(p_metadata jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  candidate text;
  full_value text;
begin
  candidate := nullif(pg_catalog.btrim(p_metadata ->> 'given_name'), '');

  if candidate is null then
    full_value := coalesce(
      nullif(pg_catalog.btrim(p_metadata ->> 'full_name'), ''),
      nullif(pg_catalog.btrim(p_metadata ->> 'name'), '')
    );

    if full_value is not null then
      candidate := pg_catalog.regexp_replace(full_value, '[[:space:]].*$', '');
    end if;
  end if;

  if candidate is null
     or pg_catalog.char_length(candidate) > 40
     or candidate ~ '[[:cntrl:]<>]' then
    return 'Friend';
  end if;

  return candidate;
end;
$$;

revoke all on function public.journey_first_name_from_metadata(jsonb)
  from public, anon, authenticated;

alter table public.journey_reward_profiles
  add column first_name text;

update public.journey_reward_profiles as profile
set first_name = public.journey_first_name_from_metadata(account.raw_user_meta_data)
from auth.users as account
where account.id = profile.user_id;

update public.journey_reward_profiles
set first_name = 'Friend'
where first_name is null;

alter table public.journey_reward_profiles
  alter column first_name set default 'Friend',
  alter column first_name set not null;

alter table public.journey_reward_profiles
  add constraint journey_reward_profiles_first_name_valid
  check (
    first_name = pg_catalog.btrim(first_name)
    and pg_catalog.char_length(first_name) between 1 and 40
    and first_name !~ '[[:cntrl:]<>]'
  ) not valid;

alter table public.journey_reward_profiles
  validate constraint journey_reward_profiles_first_name_valid;

create or replace function public.journey_create_profile_after_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.journey_ensure_profile_for_user(new.id);

  update public.journey_reward_profiles
  set first_name = public.journey_first_name_from_metadata(new.raw_user_meta_data),
      updated_at = pg_catalog.clock_timestamp()
  where user_id = new.id;

  return new;
end;
$$;

revoke all on function public.journey_create_profile_after_signup()
  from public, anon, authenticated;

create or replace function public.get_my_journey_first_name()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  saved_first_name text;
begin
  if current_user_id is null then
    raise exception 'Sign in to view your Journey name';
  end if;

  perform public.journey_ensure_profile_for_user(current_user_id);

  select profile.first_name
  into saved_first_name
  from public.journey_reward_profiles as profile
  where profile.user_id = current_user_id;

  return coalesce(saved_first_name, 'Friend');
end;
$$;

revoke all on function public.get_my_journey_first_name()
  from public, anon, authenticated;
grant execute on function public.get_my_journey_first_name()
  to authenticated;

create or replace function public.update_my_journey_first_name(p_first_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  cleaned_first_name text;
begin
  if current_user_id is null then
    raise exception 'Sign in to change your Journey name';
  end if;

  if p_first_name is null or p_first_name ~ '[[:cntrl:]<>]' then
    raise exception 'Enter a valid first name'
      using errcode = '22023';
  end if;

  cleaned_first_name := pg_catalog.btrim(p_first_name);

  if pg_catalog.char_length(cleaned_first_name) < 1
     or pg_catalog.char_length(cleaned_first_name) > 40 then
    raise exception 'First name must be between 1 and 40 characters'
      using errcode = '22023';
  end if;

  perform public.journey_ensure_profile_for_user(current_user_id);

  update public.journey_reward_profiles
  set first_name = cleaned_first_name,
      updated_at = pg_catalog.clock_timestamp()
  where user_id = current_user_id;

  return cleaned_first_name;
end;
$$;

revoke all on function public.update_my_journey_first_name(text)
  from public, anon, authenticated;
grant execute on function public.update_my_journey_first_name(text)
  to authenticated;

create or replace function public.get_conflict_journey_leaderboard()
returns table (
  "rank" bigint,
  alias text,
  journey_points integer,
  completed_chapters integer,
  is_current_user boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with player_scores as (
    select
      profile.user_id,
      profile.alias,
      coalesce(score.completed_chapters, 0)::integer as completed_chapters
    from public.journey_reward_profiles as profile
    left join public.reading_plan_progress as progress
      on progress.user_id = profile.user_id
     and progress.plan_id = 'bible-conflict-ages-chapters-v1'
    left join lateral (
      select pg_catalog.count(distinct completed_index)::integer
        as completed_chapters
      from pg_catalog.unnest(
        coalesce(progress.completed_indices, array[]::integer[])
      ) as completed(completed_index)
      where completed_index between 0 and 1695
    ) as score on true
  ),
  ranked_players as (
    select
      pg_catalog.dense_rank()
        over (order by player.completed_chapters desc) as player_rank,
      player.user_id,
      player.alias,
      player.completed_chapters
    from player_scores as player
  )
  select
    player.player_rank as "rank",
    player.alias,
    player.completed_chapters * 10 as journey_points,
    player.completed_chapters,
    player.user_id = auth.uid() as is_current_user
  from ranked_players as player
  order by player.player_rank, pg_catalog.lower(player.alias);
$$;

revoke all on function public.get_conflict_journey_leaderboard()
  from public, anon, authenticated;
grant execute on function public.get_conflict_journey_leaderboard()
  to authenticated;

alter table public.journey_reward_profiles enable row level security;
revoke all on table public.journey_reward_profiles
  from anon, authenticated;

comment on table public.journey_reward_profiles is
  'Private reward profiles. Only the random alias is disclosed by leaderboard RPCs.';
comment on column public.journey_reward_profiles.first_name is
  'Caller-private welcome name; never included in leaderboard output.';
comment on function public.get_conflict_journey_leaderboard() is
  'Alias-only Bible/Conflict ranking derived from distinct valid synced chapter-task progress.';
