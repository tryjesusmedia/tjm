# ChronBible authority

The Google Doc **ChronBible — Complete Guided Manuscript** is the authoritative reading plan and guide:
https://docs.google.com/document/d/11JsQNJrr6Q4_seXuJbVr2zzXyA5esrp3ud5ixP9AbOw/edit

Read the current document before changing reading order, titles, references, section boundaries, or guidance. Preserve its wording and theological choices. Do not restore the historical source-51 subdivisions as the current plan.

`data/google-doc-source.json` is the checked-in text snapshot with its source revision. Refresh it from the document, then run `node scripts/build-chronological-plan.mjs`, `node scripts/build-chronological-badges.mjs`, and `node scripts/test-chronological-plan.mjs` from the repository root.

`data/legacy-v4.json` is an immutable migration fixture, not an editorial source. Never reuse a progress plan ID if the meaning or order of passage indices changes. Preserve old progress rows and migrate only verses actually assigned by an old completed task. Never equate reading numbers across versions.
