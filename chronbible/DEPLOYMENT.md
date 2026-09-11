# Chronological Bible journey deployment

The static route is `/chronbible/`. It uses the same Supabase project and Google identity as the chronological Bible screen in Try Jesus: The Journey. Both clients consume the same generated 313-task plan, organized into 11 major historical sections. The full book of Job appears in five manageable tasks after Genesis 10–11 and before Genesis 12–17.

## Shared sync contract

- Progress plan ID: `chronological-bible-order-v4`
- Stable notes/principles plan ID: `chronological-bible-order-v3`
- Saved progress automatically migrates from chapter-based version 3, task-based version 2, and original-assignment version 1 records.
- Table: `public.reading_plan_progress`
- Completion values: zero-based chapter indices `0` through `1204`
- Current place: `last_index`
- Private principles and Members posts continue using `chronological-bible-order-v3` in the existing `conflict_principles`, `conflict_discussion_posts`, and `conflict_discussion_replies` tables. Keeping this namespace stable preserves every existing note while progress moves safely to version 4.

`scripts/build-chronological-plan.mjs` writes identical generated plan data to `chronbible/data/readings.json` and `tryjesusjourney/data/chronologicalBiblePlan.json`. It also carries explicit chapter and reading-index maps so previous checkmarks and resume positions survive the Job reordering.

The table and row-level security policies are defined in `tryjesusjourney/supabase/sql/app-upgrade.sql` and are already used by the mobile app.

## Authentication configuration

Google must remain enabled in Supabase Authentication. The allowed redirect URL must include:

`https://tryjesusmedia.com/chronbible/`

The Supabase publishable key in `config.js` is public client configuration. Never add a service-role key or Google client secret to this repository.
