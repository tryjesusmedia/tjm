# Bible & Conflict of the Ages deployment

The page is a static route at `/bibleandconflictoftheages/`. It uses the same Supabase project and Google identity as the native app.

## Owner steps before launch

1. In the Supabase SQL editor, run `tryjesusjourney/supabase/sql/conflict-journey.sql`.
2. In **Authentication → URL Configuration**, add these exact redirect URLs:
   - `https://tryjesusmedia.com/bibleandconflictoftheages/`
   - the deployment-preview URL for any preview environment used for acceptance testing
3. Confirm Google is enabled in **Authentication → Providers**. The native app already expects this provider.
4. Deploy the `tjm-site` repository through the existing GitHub/Cloudflare Pages pipeline.
5. Build/release the app after the native entry point is accepted. Both surfaces use plan ID `bible-conflict-ages-v1` and the tables created by the migration.

The Supabase publishable key in `config.js` is intentionally public client configuration. Never add the service-role key or Google client secret to this repository.

## Source-of-truth workflow

`data/readings.json` is generated from the five supplied plans by `tjm-site/scripts/import-conflict-reading-plans.mjs`. The importer writes the same validated JSON bundle to `tryjesusjourney/data/conflictPlan.json`. It preserves source blocks and order, and writes ambiguous entries to `reviewQueue` instead of correcting them.
