-- Restore moderation-free, system-generated leaderboard aliases.
-- Any free-text alias saved while customization was available is replaced.

revoke all on function public.update_journey_alias(text)
  from public, anon, authenticated;
drop function if exists public.update_journey_alias(text);

do $$
declare
  profile record;
  candidate_alias text;
  attempt integer;
begin
  for profile in
    select user_id
    from public.journey_reward_profiles
    order by user_id
  loop
    attempt := 0;
    loop
      candidate_alias := public.journey_alias_from_seed(
        profile.user_id::text || ':restored:' || attempt::text
      );
      begin
        update public.journey_reward_profiles
        set alias = candidate_alias,
            updated_at = pg_catalog.clock_timestamp(),
            alias_changed_at = null
        where user_id = profile.user_id;
        exit;
      exception
        when unique_violation then
          attempt := attempt + 1;
          if attempt >= 30 then
            raise exception 'Could not restore a unique Journey alias';
          end if;
      end;
    end loop;
  end loop;
end;
$$;

comment on column public.journey_reward_profiles.alias is
  'System-generated public leaderboard alias; free-text aliases are not accepted.';
