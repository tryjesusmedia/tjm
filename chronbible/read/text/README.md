# Bundled public-domain Bible text (WEB and KJV)

These are **actual, complete 66-book text files committed to the Try Jesus Media
GitHub repository**, not links to an external Bible API.

- `web/*.json` — World English Bible (WEB), 66 books / 1,189 chapters.
- `kjv/*.json` — King James Version (KJV), 66 books / 1,189 chapters.
- File format: one JSON per Bible book, with `chapters[].verses[]` storing the
  numbered verses in their original edition's wording.
- The reading application maps all **1,440 ChronBible passage entries**, across
  **313 readings**, to the stored files.
- JSON files are mirrored unchanged from
  [midvash/bible-data](https://github.com/midvash/bible-data), subpaths
  `versions/en/web/books/*.json` and `versions/en/kjv/books/*.json`
  (source data last updated 2026-10-28 according to its README).
- WEB provenance: World English Bible, eBible.org:
  https://ebible.org/details.php?id=engwebp
- KJV provenance: traditional King James Version, Oxford 1769 standard text
  (public domain in the United States; special rights may apply elsewhere).

**Text fidelity:** The JSON verse text is not rewritten, summarized, edited, or
generated. ChronBible only selects the Scripture verses specified by its reading
plan, and displays their original verse numbers. The upstream WEB data has
31,098 numbered verses (some traditional verse numbers differ from KJV);
the KJV data has 31,102. Those differences belong to the editions and are not
"missing" remote API calls.

**Reliability:** The reader fetches these assets from the same site as ChronBible.
The current third-party `bible-api.com` integration is no longer used. The
service worker caches the reader shell and previously visited books, and the
reader's settings menu offers an optional full offline download of all 132 files
(WEB + KJV). Browser storage may still be evicted by the OS, so offline access
cannot be guaranteed indefinitely without preserving the offline package.

**Maintenance:** Files are committed and pinned; upstream changes will not
automatically modify these translations or silently alter biblical text.
