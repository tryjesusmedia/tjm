import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const [welcome, signup, guideScript, guideStyles, mapSource, mapStyles, conflictConfig, chronConfig, conflictTheme, conflictPage, chronPage, chronStyles] = await Promise.all([
  read("welcome/index.html"),
  read("signupcomplete/index.html"),
  read("assets/guide-experience.js"),
  read("assets/readability.css"),
  read("lib/principles-folders-flow.mjs"),
  read("lib/principles-folders-flow.css"),
  read("bibleandconflictoftheages/config.js"),
  read("chronbible/config.js"),
  read("bibleandconflictoftheages/faithcraft-theme.css"),
  read("bibleandconflictoftheages/index.html"),
  read("chronbible/index.html"),
  read("chronbible/styles.css"),
]);

for (const page of [welcome, signup]) {
  assert.doesNotMatch(page, />\s*Enter the Zoom Call\s*</);
  assert.equal((page.match(/https:\/\/us06web\.zoom\.us\/j\/4700414908/g) || []).length, 1);
  assert.match(page, /readability\.css\?v=20260911-1/);
  assert.match(page, /guide-experience\.js\?v=20260911-1/);
}

for (const copy of [
  "Bible Guides",
  "Choose one of your two guide journeys. Your progress is saved separately for each set.",
  "10-GUIDE RELATIONSHIP JOURNEY",
  "9-GUIDE PROPHECY JOURNEY",
  "Get to Know Jesus",
  "Bible Prophecy",
  "See Guides",
  "Hide Guides",
]) assert.match(guideScript, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

assert.match(guideScript, /app-guide-progress-track/);
assert.match(guideStyles, /#bible-guides\.app-guide-library/);
for (const color of ["#171418", "#311e33", "#eebd4a", "#2a222b", "#fff9ee"]) {
  assert.match(guideStyles.toLowerCase(), new RegExp(color));
}

assert.doesNotMatch(mapSource, /className="tjm-fm-toolbar-(?:add|search)"/);
assert.match(mapSource, /data-horizontal-pan="locked"/);
assert.match(mapSource, /bottommostNodeTop/);
assert.match(mapSource, /zIndex: expandedId === principle\.id \? 1000 : 0/);
assert.match(mapSource, /next\.mapOpen = false;[\s\S]*goToReadingById/);
assert.match(mapStyles, /react-flow__node:has\(\.tjm-fm-principle\.is-expanded\)/);

assert.match(conflictConfig, /faithcraft-theme\.css\?v=20260911-1/);
assert.doesNotMatch(chronConfig, /faithcraft-theme/);
assert.match(conflictPage, /theme-color" content="#010c18"/);
assert.match(chronPage, /theme-color" content="#241425"/);
assert.match(chronPage, /styles\.css\?v=20260911-1/);
assert.match(chronStyles, /Match the website Principles Map to the native Chron Bible map/);
for (const color of ["#171418", "#211b22", "#2a222b", "#311e33", "#eebd4a", "#f3e8d0"]) {
  assert.match(chronStyles.toLowerCase(), new RegExp(color));
}
for (const color of ["#010c18", "#03101d", "#c79341", "#e5b55b", "#186059", "#298075", "#ebe9de", "#fdfaf2"]) {
  assert.match(conflictTheme.toLowerCase(), new RegExp(color));
}

console.log("Website/app parity validation passed for Bible Guides, Principles Maps, Zoom links, and the FaithCraft-only theme.");
