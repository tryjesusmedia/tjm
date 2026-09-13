-- Allow each signed-in reader to choose their own public leaderboard name.

create or replace function public.update_journey_alias(p_alias text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  cleaned_alias text;
begin
  if current_user_id is null then
    raise exception 'Sign in to change your leaderboard name';
  end if;

  if p_alias is null or p_alias ~ '[[:cntrl:]<>]' then
    raise exception 'Enter a valid leaderboard name' using errcode = '22023';
  end if;

  cleaned_alias := pg_catalog.regexp_replace(pg_catalog.btrim(p_alias), '[[:space:]]+', ' ', 'g');
  if pg_catalog.char_length(cleaned_alias) < 3
     or pg_catalog.char_length(cleaned_alias) > 40 then
    raise exception 'Leaderboard name must be between 3 and 40 characters' using errcode = '22023';
  end if;

  perform public.journey_ensure_profile_for_user(current_user_id);
  begin
    update public.journey_reward_profiles
    set alias = cleaned_alias,
        updated_at = pg_catalog.clock_timestamp(),
        alias_changed_at = pg_catalog.clock_timestamp()
    where user_id = current_user_id;
  exception
    when unique_violation then
      raise exception 'That leaderboard name is already in use. Please choose another.' using errcode = '23505';
  end;

  return cleaned_alias;
end;
$$;

revoke all on function public.update_journey_alias(text) from public, anon, authenticated;
grant execute on function public.update_journey_alias(text) to authenticated;

comment on function public.update_journey_alias(text) is
  'Lets an authenticated reader update only their own public leaderboard alias.';
