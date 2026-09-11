# Chronological Bible journey deployment

The static route is `/chronbible/`. It uses the same Supabase project and Google identity as the chronological Bible screen in Try Jesus: The Journey. Both clients consume the same generated 313-task plan, organized into 11 major historical sections. The full book of Job appears in five manageable tasks after Genesis 10–11 and before Genesis 12–17.

## Shared sync contract

- Progress plan ID: `chronological-bible-order-v4`
- Saved progress automatically migrates from chapter-based version 3, task-based version 2, and original-assignment version 1 records.
- Table: `public.reading_plan_progress`
- Completion values: zero-based chapter indices `0` through `1204`
- Current place: `last_index`
- Notes, principles, and highlighting are not loaded by this experience. Existing historical records remain in Supabase so no user data is erased.
- Scripture buttons open their exact passage in the KJV on BibleGateway.

`scripts/build-chronological-plan.mjs` writes identical generated plan data to `chronbible/data/readings.json` and `tryjesusjourney/data/chronologicalBiblePlan.json`. It also carries explicit chapter and reading-index maps so previous checkmarks and resume positions survive the Job reordering.

The progress table and row-level security policies are defined in `tryjesusjourney/supabase/sql/app-upgrade.sql`.

## Authentication configuration

Google must remain enabled in Supabase Authentication. The allowed redirect URL must include:

`https://tryjesusmedia.com/chronbible/`

The Supabase publishable key in `config.js` is public client configuration. Never add a service-role key or Google client secret to this repository.
