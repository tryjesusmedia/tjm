# Mind Map principle names

Apply `migrations/20260903190000_principle_names.sql` in the Supabase SQL editor for the journey project. The migration adds a nullable name and an authenticated, owner-scoped naming function; existing rows, numbers, reading links, cross-references, and RPCs remain compatible. An unnamed principle displays `Principle #N`.

The site deploy does not execute database migrations. Until this migration is applied, editing and duplicating principles still work. Names are retained in browser storage under the account and reading plan, and the interface reports that names are saved on this device. Saving that principle again after the migration uploads the pending name. Other save failures also retain the pending name rather than discarding it.

The browser fixtures use a simulated account and database. They never modify members' production principles.
