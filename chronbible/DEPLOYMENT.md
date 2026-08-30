# Chronological Bible journey deployment

The static route is `/chronbible/`. It uses the same Supabase project, Google identity, plan ID, and `reading_plan_progress` record as the chronological Bible screen in Try Jesus: The Journey.

## Shared sync contract

- Plan ID: `chronological-bible-order-v3` (automatically migrates saved progress from versions 1 and 2)
- Table: `public.reading_plan_progress`
- Completion values: zero-based chapter indices `0` through `1165`
- Current place: `last_index`
- Private principles and Members posts use the existing `conflict_principles`, `conflict_discussion_posts`, and `conflict_discussion_replies` tables, separated by the chronological plan ID.

The table and row-level security policies are defined in `tryjesusjourney/supabase/sql/app-upgrade.sql` and are already used by the mobile app.

## Authentication configuration

Google must remain enabled in Supabase Authentication. The allowed redirect URL must include:

`https://tryjesusmedia.com/chronbible/`

The Supabase publishable key in `config.js` is public client configuration. Never add a service-role key or Google client secret to this repository.
