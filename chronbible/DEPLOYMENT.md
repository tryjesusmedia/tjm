# ChronBible: Google Doc edition

The canonical route is `/chronbible/`. `/cronbible/` redirects there.

## Editorial authority

[ChronBible — Complete Guided Manuscript](https://docs.google.com/document/d/11JsQNJrr6Q4_seXuJbVr2zzXyA5esrp3ud5ixP9AbOw/edit) is the authoritative plan and guide, by the owner's instruction of October 5, 2026. The historical repository plan is no longer the editorial source.

The website follows its 313 titles, references, reading order, 11 section boundaries, 1,440 passage checkboxes, introductions, reflection questions, small steps, Jesus connections, long-reading guidance, section reflections, front-matter guidance, people/places, and glossary. The divided-kingdom comparison remains a table. Print-only ownership pages, blank note lines, and page-number contents are omitted; the Journey view supplies the navigable reading index. Readers can keep notes in their own notebook.

`data/google-doc-source.json` stores the source document ID, revision ID, and extracted text/style paragraphs. This is a reviewed snapshot, not an automatic live connection. To update it, read the current document with the Google Docs connector, replace the snapshot's revision and paragraphs, build, and inspect the diff. Do not use an older local manuscript or the legacy fixture as authority.

```
node scripts/build-chronological-plan.mjs
node scripts/build-chronological-badges.mjs
node scripts/test-chronological-plan.mjs
node scripts/test-chronological-badges.mjs
node scripts/test-reading-account-isolation.mjs
```

The builder validates all 31,102 verses exactly once against the repository KJV dataset and checks every checkbox sequence and reading-index entry. BibleGateway links contain each exact assigned passage. The guide itself reproduces references, not copyrighted Bible text.

## Progress and app compatibility

- New website progress ID: `chronological-bible-doc-v5`.
- Storage: the existing `public.reading_plan_progress`, same account and ownership policies.
- Completion values: passage indices 0–1439; `last_index` is the zero-based reading position.
- `data/legacy-v4.json` is immutable migration evidence. Prior v1–v3 mappings are first converted to v4; then only the verses actually assigned under checked old tasks qualify a new passage as complete. A full new passage must be covered. Old full-chapter link labels never imply completion beyond their assigned reference.
- Resume location follows the old reading's first passage into the new sequence. Readers can use Journey to choose another place.
- Old database rows are retained. An existing v5 row always wins. Later changes in an older installed app do not overwrite the revised website plan.
- The website's new `get_chronbible_doc_leaderboard` RPC scores 10 points per completed passage and respects the existing safe-alias and block rules. Old app scores/RPCs are unchanged. New-edition scores and badges are based on migrated passage completion, so totals can differ from old chapter-task totals.
- Existing installed apps still use their older plan until separately updated. This change does not publish a mobile app release. Accounts are shared, but old and new plan completion records are intentionally separate.
- If a future document edit changes passage indices, add another version and migration; do not silently overwrite the meaning of v5 indices.

## Deployment

Commit the static site to the repository's production branch (`main`), which is connected to Cloudflare Pages. Apply the additive `chronbible_doc_leaderboard` migration before deploying the frontend. Never expose service-role credentials. Keep the existing Google OAuth redirect `https://tryjesusmedia.com/chronbible/` and public client configuration.

After deployment, verify the live plan's document revision, reading and verse counts, exact links, guide navigation, and sign-in/progress behavior. The old plan fixture and source snapshot are static public editorial data; they contain no account records.
