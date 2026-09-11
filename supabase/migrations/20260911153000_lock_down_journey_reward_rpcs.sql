-- Canonical copy: deployed from the linked Try Jesus Journey repository.

revoke all on function public.journey_alias_from_seed(text) from public, anon, authenticated;
revoke all on function public.journey_ensure_profile_for_user(uuid) from public, anon, authenticated;
revoke all on function public.journey_create_profile_after_signup() from public, anon, authenticated;

revoke all on function public.ensure_journey_profile() from public, anon;
revoke all on function public.reroll_journey_alias() from public, anon;
revoke all on function public.get_journey_leaderboard() from public, anon;

grant execute on function public.ensure_journey_profile() to authenticated;
grant execute on function public.reroll_journey_alias() to authenticated;
grant execute on function public.get_journey_leaderboard() to authenticated;
