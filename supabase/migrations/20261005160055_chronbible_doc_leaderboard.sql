create or replace function public.get_chronbible_doc_leaderboard()
returns table (rank bigint, alias text, journey_points integer, completed_chapters integer, is_current_user boolean)
language sql stable security definer set search_path = '' as $$
  with scores as (
    select profile.user_id, profile.alias, coalesce(score.n,0)::integer as n
    from public.journey_reward_profiles profile
    left join public.reading_plan_progress progress
      on progress.user_id=profile.user_id and progress.plan_id='chronological-bible-doc-v5'
    left join lateral (
      select count(distinct i)::integer as n
      from pg_catalog.unnest(coalesce(progress.completed_indices,array[]::integer[])) as done(i)
      where i between 0 and 1439
    ) score on true
    where auth.uid() is not null and public.journey_alias_is_safe(profile.alias)
      and (profile.user_id=auth.uid() or not exists (
        select 1 from public.journey_leaderboard_blocks b
        where (b.blocker_user_id=auth.uid() and b.blocked_user_id=profile.user_id)
           or (b.blocker_user_id=profile.user_id and b.blocked_user_id=auth.uid())
      ))
  )
  select dense_rank() over(order by n desc), alias, n*10, n, user_id=auth.uid()
  from scores order by n desc, pg_catalog.lower(alias);
$$;
revoke all on function public.get_chronbible_doc_leaderboard() from public, anon, authenticated;
grant execute on function public.get_chronbible_doc_leaderboard() to authenticated;
comment on function public.get_chronbible_doc_leaderboard() is 'Authenticated alias-only ranking for the Google Doc passage plan. Legacy app scores are unchanged.';
