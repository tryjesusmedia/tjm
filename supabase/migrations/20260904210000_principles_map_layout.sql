-- Sync Principles Map folders and node placement while keeping each device's viewport local.
begin;

create table if not exists public.conflict_principle_map_layouts (
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null,
  layout jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, plan_id),
  constraint conflict_principle_map_layouts_plan_length check (char_length(plan_id) between 1 and 120),
  constraint conflict_principle_map_layouts_object check (jsonb_typeof(layout) = 'object'),
  constraint conflict_principle_map_layouts_size check (octet_length(layout::text) <= 2000000)
);

alter table public.conflict_principle_map_layouts enable row level security;

drop policy if exists "People can read their own principle map layout" on public.conflict_principle_map_layouts;
create policy "People can read their own principle map layout"
  on public.conflict_principle_map_layouts for select
  using (auth.uid() = user_id);

drop policy if exists "People can create their own principle map layout" on public.conflict_principle_map_layouts;
create policy "People can create their own principle map layout"
  on public.conflict_principle_map_layouts for insert
  with check (auth.uid() = user_id);

drop policy if exists "People can update their own principle map layout" on public.conflict_principle_map_layouts;
create policy "People can update their own principle map layout"
  on public.conflict_principle_map_layouts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.get_principle_map_layout(p_plan_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select layout
    from public.conflict_principle_map_layouts
    where user_id = auth.uid() and plan_id = trim(p_plan_id)
  ), '{}'::jsonb);
$$;

create or replace function public.save_principle_map_layout(p_plan_id text, p_layout jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_plan_id text := trim(coalesce(p_plan_id, ''));
  clean_layout jsonb := coalesce(p_layout, '{}'::jsonb);
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if char_length(clean_plan_id) not between 1 and 120 then raise exception 'Invalid reading plan'; end if;
  if jsonb_typeof(clean_layout) <> 'object' then raise exception 'Invalid Principles Map layout'; end if;
  if octet_length(clean_layout::text) > 2000000 then raise exception 'Principles Map layout is too large'; end if;

  insert into public.conflict_principle_map_layouts (user_id, plan_id, layout, updated_at)
  values (current_user_id, clean_plan_id, clean_layout, now())
  on conflict (user_id, plan_id) do update
    set layout = excluded.layout, updated_at = excluded.updated_at;

  return clean_layout;
end;
$$;

revoke all on function public.get_principle_map_layout(text) from public, anon;
revoke all on function public.save_principle_map_layout(text, jsonb) from public, anon;
grant execute on function public.get_principle_map_layout(text) to authenticated;
grant execute on function public.save_principle_map_layout(text, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
