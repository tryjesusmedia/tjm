# Reading account cutover

This branch switches Bible & Conflict to its dedicated Supabase project, `gabufylczphhykudwzbc`. ChronBible keeps `erejehmrtzjpqurbftsm`.

**Ready for website cutover on September 18, 2026.** Google OAuth and return URLs were saved by the owner. The preview's Google sign-in reaches the account chooser. The Conflict-only snapshot was imported and verified; a completed signed-in callback still needs a real-user check after production deployment.

The schema, account migration export query, database isolation tests, and cutover procedure are in the `tryjesusmedia/bibleandconflict` repository on `feat/separate-reading-accounts`, under `supabase/` and `ops/account-separation.md`. The baseline must never be applied to the Journey project.

The new project's schema and account-deletion function are deployed. The snapshot at `2026-09-18T16:55:54Z` preserved 10 Google accounts, their profiles, 51 reading-progress records, 8 plan-progress rows, 10 settings, 8 principles, 2 layouts, and 1 highlight. Every copied row was verified exactly in the import transaction. No sessions, credentials, ChronBible rows, or JWT signing keys were copied; the source rows remain intact.

This change keeps browser sessions, profiles, progress, leaderboards, and deletion independent between the two journeys. The Conflict website and Conflict standalone app still sync with each other. The same Google email can sign in separately to both journeys.

Validation: `node scripts/test-reading-account-isolation.mjs`, syntax checks for both runtimes, the SDK session-isolation test in the standalone app, and rolled-back database tests for ownership, plan isolation, scoring, anonymous access, and deletion. The Cloudflare preview deployed successfully. Existing intro/folder/principle-name static checks fail identically on unchanged main; a browser folder fixture also has an unrelated menu-overlap failure. No checks were disabled.

The standalone app change is prepared as version 1.0.3 (Android build 4, iOS build 3) in bibleandconflict PR #1. It has not been released to stores. Older installed versions retain their original backend and do not sync with this separated website. Website deployment does not depend on publishing that app; installed-device callback/sync validation remains a separate release task.

After deployment, sign into each website separately, confirm existing Conflict progress, and check that signing out of either leaves the other signed in. The same Google email may be used, but each service has an independent account/session. Do not reimport a snapshot over newer target edits or deletions.
