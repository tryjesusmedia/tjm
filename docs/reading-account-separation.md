# Reading account cutover

This branch switches Bible & Conflict to its dedicated Supabase project, `gabufylczphhykudwzbc`. ChronBible keeps `erejehmrtzjpqurbftsm`.

**Do not publish this branch until Google OAuth is configured, the Conflict-only account/data snapshot is imported and verified, and the matching standalone app release is ready.** The production website has not been switched yet.

The schema, account migration export query, database isolation tests, and cutover procedure are in the `tryjesusmedia/bibleandconflict` repository on `feat/separate-reading-accounts`, under `supabase/` and `ops/account-separation.md`. The baseline must never be applied to the Journey project.

The new project's schema and account-deletion function are deployed. Real users and saved progress are still only in the original project. Dashboard login is needed to configure Google OAuth; the connector does not expose provider settings.

This change keeps browser sessions, profiles, progress, leaderboards, and deletion independent between the two journeys. The Conflict website and Conflict standalone app still sync with each other. The same Google email can sign in separately to both journeys.

Validation: `node scripts/test-reading-account-isolation.mjs`, syntax checks for both runtimes, and the SDK session-isolation test in the standalone app. Google callbacks and installed-device migration remain required before cutover.
