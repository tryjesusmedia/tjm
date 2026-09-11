import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const [welcome, signup, guideScript, guideStyles, readerSource, readerStyles, conflictConfig, chronConfig, conflictTheme, conflictPage, chronPage] = await Promise.all([
  read("welcome/index.html"),
  read("signupcomplete/index.html"),
  read("assets/guide-experience.js"),
  read("assets/readability.css"),
  read("lib/native-bible-reader.js"),
  read("lib/native-bible-reader.css"),
  read("bibleandconflictoftheages/config.js"),
  read("chronbible/config.js"),
  read("bibleandconflictoftheages/faithcraft-theme.css"),
  read("bibleandconflictoftheages/index.html"),
  read("chronbible/index.html"),
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
assert.match(guideScript, /\/bible-reader\/\?reference=/);
assert.match(guideStyles, /#bible-guides\.app-guide-library/);
for (const color of ["#171418", "#311e33", "#eebd4a", "#2a222b", "#fff9ee"]) {
  assert.match(guideStyles.toLowerCase(), new RegExp(color));
}

assert.match(readerSource, /KJV/);
assert.match(readerSource, /WEB/);
assert.match(readerSource, /data-choose-highlight-color/);
assert.match(readerSource, /bible_highlights/);
assert.match(readerStyles, /\.nbr-notes-fab/);
assert.match(readerStyles, /grid-template-columns:\s*1fr 1fr/);

assert.match(conflictConfig, /faithcraft-theme\.css\?v=20260911-1/);
assert.doesNotMatch(chronConfig, /faithcraft-theme/);
assert.match(conflictPage, /theme-color" content="#010c18"/);
assert.match(chronPage, /theme-color" content="#241425"/);
assert.match(chronPage, /styles\.css\?v=20260911-1/);
for (const page of [conflictPage, chronPage]) {
  assert.match(page, /native-bible-reader\.js/);
  assert.doesNotMatch(page, /principles-folders|principles\.js|principles\.css/);
}
for (const color of ["#010c18", "#03101d", "#c79341", "#e5b55b", "#186059", "#298075", "#ebe9de", "#fdfaf2"]) {
  assert.match(conflictTheme.toLowerCase(), new RegExp(color));
}

console.log("Website/app parity validation passed for Bible Guides, native Bible reading, highlight notes, Zoom links, and the FaithCraft-only theme.");
