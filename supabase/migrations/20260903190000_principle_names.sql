-- Additive migration for both journey Mind Maps. Existing RPCs and rows remain compatible.
begin;

alter table public.conflict_principles
  add column if not exists principle_name text;

alter table public.conflict_principles
  drop constraint if exists conflict_principles_name_length;
alter table public.conflict_principles
  add constraint conflict_principles_name_length
  check (principle_name is null or char_length(principle_name) between 1 and 120);

create or replace function public.set_conflict_principle_name(
  p_principle_id uuid,
  p_name text
)
returns setof public.conflict_principles
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  saved public.conflict_principles;
  clean_name text := nullif(trim(coalesce(p_name, '')), '');
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if char_length(clean_name) > 120 then raise exception 'A principle name can be up to 120 characters'; end if;

  update public.conflict_principles
  set principle_name = clean_name
  where id = p_principle_id and user_id = current_user_id and deleted_at is null
  returning * into saved;
  if not found then raise exception 'Principle not found'; end if;

  return query select * from public.conflict_principles
    where user_id = current_user_id and plan_id = saved.plan_id and deleted_at is null
    order by principle_number;
end;
$$;

revoke all on function public.set_conflict_principle_name(uuid, text) from public, anon;
grant execute on function public.set_conflict_principle_name(uuid, text) to authenticated;
notify pgrst, 'reload schema';
commit;
