create table if not exists public.bible_highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null,
  reading_id text not null,
  translation text not null check (translation in ('KJV', 'WEB')),
  chapter_label text not null,
  start_offset integer not null check (start_offset >= 0),
  end_offset integer not null check (end_offset > start_offset),
  selected_text text not null check (length(btrim(selected_text)) > 0),
  color text not null check (color in ('yellow', 'orange', 'red', 'green', 'cyan', 'purple')),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_mutation_id uuid not null,
  deleted_at timestamptz
);

alter table public.bible_highlights
  add column if not exists deleted_at timestamptz;

create or replace function public.preserve_bible_highlight_tombstone()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.deleted_at is not null then
    return old;
  end if;
  if new.deleted_at is not null then
    return new;
  end if;
  if new.updated_at < old.updated_at then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists preserve_bible_highlight_tombstone on public.bible_highlights;
create trigger preserve_bible_highlight_tombstone
  before update on public.bible_highlights
  for each row execute function public.preserve_bible_highlight_tombstone();

create unique index if not exists bible_highlights_user_mutation_unique
  on public.bible_highlights(user_id, client_mutation_id);

create index if not exists bible_highlights_user_created_index
  on public.bible_highlights(user_id, created_at desc);

alter table public.bible_highlights enable row level security;

drop policy if exists "Users can read their own Bible highlights" on public.bible_highlights;
create policy "Users can read their own Bible highlights"
  on public.bible_highlights for select
  using (auth.uid() = user_id);

drop policy if exists "Users can add their own Bible highlights" on public.bible_highlights;
create policy "Users can add their own Bible highlights"
  on public.bible_highlights for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can edit their own Bible highlights" on public.bible_highlights;
create policy "Users can edit their own Bible highlights"
  on public.bible_highlights for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own Bible highlights" on public.bible_highlights;

revoke delete on public.bible_highlights from authenticated;
grant select, insert, update on public.bible_highlights to authenticated;
