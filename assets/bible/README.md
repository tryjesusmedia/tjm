# Native Bible data

The web reader lazy-loads one compact translation file at a time.

- `kjv.json` is built without modifying the verse text from eBible.org's complete `ENG-KJV2006` verse-per-line distribution (public domain).
- `web.json` is built without modifying the verse text from eBible.org's `ENGWEBP` verse-per-line distribution. The World English Bible is public domain; “World English Bible” is a trademark of eBible.org.

Run `npm run bible:data` to reproduce both generated files. The build script downloads both official eBible.org archives and validates sequential verse numbering plus the exact corpus sizes: 1,189 chapters and 31,102 verses for KJV; 1,189 chapters and 31,103 verse records for WEB (including its intentionally blank variant records).

## Highlight offset contract (v1)

Web and mobile highlights use offsets over the stable plain text of one chapter. That text is the original verse text, in verse order, joined with exactly one line-feed character (`\n`) between verses. Verse numbers, headings, spacing added by the interface, and other display-only content are excluded. Offsets count JavaScript UTF-16 code units, use a start-inclusive/end-exclusive range, and `selected_text` must equal `chapterText.slice(start_offset, end_offset)`. The displayed verse reference is derived by finding every verse whose text range intersects that saved range.

Deletion is synchronized with an immutable nullable `deleted_at` tombstone. Clients never hard-delete highlight rows, never clear `deleted_at`, and exclude tombstoned rows from all reading and Notes interfaces. A remote tombstone wins over an offline edit regardless of `updated_at`, preventing another device from restoring a deleted highlight.

Before reconciling, clients fetch every row for the signed-in user in deterministic `id` order using 1,000-row pages. For live rows, the database keeps the row with the newer `updated_at`; a client that submits a stale edit adopts the newer row returned by the database instead of marking its stale copy as synced.
