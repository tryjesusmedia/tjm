# Bible & Conflict of the Ages deployment

The page is a static route at `/bibleandconflictoftheages/`. It uses the same Supabase project and Google identity as the native app.

## Owner steps before launch

1. In the Supabase SQL editor, run `tryjesusjourney/supabase/sql/conflict-journey.sql` and `supabase/migrations/20260911000000_bible_highlights.sql`.
2. In **Authentication → URL Configuration**, add these exact redirect URLs:
   - `https://tryjesusmedia.com/bibleandconflictoftheages/`
   - the deployment-preview URL for any preview environment used for acceptance testing
3. Confirm Google is enabled in **Authentication → Providers**. The native app already expects this provider.
4. Deploy the `tjm-site` repository through the existing GitHub/Cloudflare Pages pipeline.
5. Build/release the app after the native entry point is accepted. Both surfaces use plan ID `bible-conflict-ages-v1` for journey records and `bible-conflict-ages-chapters-v1` in `reading_plan_progress` for the 1,696 individual chapter checkmarks. Existing whole-assignment completion records are migrated automatically.

The Supabase publishable key in `config.js` is intentionally public client configuration. Never add the service-role key or Google client secret to this repository.

## Source-of-truth workflow

`data/readings.json` is generated from the five supplied plans by `tjm-site/scripts/import-conflict-reading-plans.mjs`. The importer writes the same validated JSON bundle to `tryjesusjourney/data/conflictPlan.json`. It preserves source blocks and order, and writes ambiguous entries to `reviewQueue` instead of correcting them.

Each Scripture assignment opens in the shared native KJV/WEB reader, including partial and discontiguous verse ranges. Companion assignments remain direct external links on `https://egwwritings.org/`. The resolved companion chapter catalog is stored in `scripts/egw-reading-links.json`; run `npm run links:egw` only when an assignment changes and its official chapter locations must be refreshed.

The former principles map is no longer loaded by this experience. Existing legacy principle records remain in Supabase and are not deleted. New highlights and notes use `public.bible_highlights`; the shared offset contract and bundled-source details are documented in `assets/bible/README.md`.
