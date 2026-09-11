import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const [rootPage, welcome, signup, guideScript, guideStyles, readerSource, readerStyles, conflictConfig, chronConfig, conflictTheme, conflictPage, conflictApp, conflictIntroStyles, chronPage, chronApp] = await Promise.all([
  read("index.html"),
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
  read("bibleandconflictoftheages/app.js"),
  read("bibleandconflictoftheages/hero-readability.css"),
  read("chronbible/index.html"),
  read("chronbible/app.js"),
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
assert.doesNotMatch(readerSource, /Select any words, then choose a highlight color\./);
assert.match(readerSource, /Choose a highlight color/);
assert.match(readerSource, /preserveContent: true/);
assert.match(readerStyles, /\.nbr-notes-fab/);
assert.match(readerStyles, /grid-template-columns:\s*1fr 1fr/);

assert.match(conflictConfig, /faithcraft-theme\.css\?v=20260911-1/);
assert.doesNotMatch(chronConfig, /faithcraft-theme/);
assert.match(conflictPage, /theme-color" content="#010c18"/);
assert.match(chronPage, /theme-color" content="#241425"/);
assert.match(chronPage, /styles\.css\?v=20260911-1/);
for (const page of [conflictPage, chronPage]) {
  assert.match(page, /native-bible-reader\.js\?v=20260911-2/);
  assert.match(page, /native-bible-reader\.css\?v=20260911-2/);
  assert.match(page, /class="faithcraft-credit" href="https:\/\/faithcraft\.agency\/" target="_blank" rel="noopener noreferrer">Powered by FaithCraft\.Agency<\/a>/);
  assert.doesNotMatch(page, /principles-folders|principles\.js|principles\.css/);
}

const disclosureStart = conflictPage.indexOf('<details class="hero-intro-more">');
const disclosureEnd = conflictPage.indexOf("</details>", disclosureStart);
const foundationIndex = conflictPage.indexOf("THE UNSHAKABLE FOUNDATION");
assert.ok(disclosureStart >= 0 && foundationIndex > disclosureStart && foundationIndex < disclosureEnd, "the foundation section must live inside the journey disclosure");
assert.equal((conflictPage.match(/THE UNSHAKABLE FOUNDATION/g) || []).length, 1);
for (const volume of ["Patriarchs and Prophets", "Prophets and Kings", "The Desire of Ages", "The Acts of the Apostles", "The Great Controversy"]) {
  const volumeIndex = conflictPage.indexOf(volume, foundationIndex);
  assert.ok(volumeIndex > foundationIndex && volumeIndex < disclosureEnd, `${volume} must stay inside the journey disclosure`);
}
assert.match(conflictIntroStyles, /\.hero-intro-more-content \.hero-mark > p,[\s\S]*\.hero-intro-more-content \.hero-book-list li[\s\S]*font-size:\s*clamp\(1\.075rem/);

for (const copy of [
  "Move at your own pace. A reading may take one sitting, several days, or longer; your next unfinished reading will be waiting whenever you return.",
  "Choose one chapter at a time. Each link opens only that chapter or its assigned verses on Bible Gateway (KJV).",
  "Choose a passage below, then read its assigned verses here in the King James Version or World English Bible.",
  "Scripture is the foundation. The companion readings help you follow the story.",
]) assert.doesNotMatch(`${conflictPage}\n${conflictApp}`, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

for (const copy of [
  "Move at your own pace; every task contains no more than ten chapters, and each button opens only one Bible chapter at a time.",
  "Choose a chapter below. Each link opens only that chapter on Bible Gateway in the King James Version.",
  "Choose a chapter below, then read it here in the King James Version or World English Bible.",
  "Synced with the app.",
  "Your completed readings and current place use the same Google account record as the chronological plan in Try Jesus: The Journey.",
  "Read Scripture. Follow the story. Continue wherever you are.",
]) assert.doesNotMatch(`${chronPage}\n${chronApp}`, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

assert.doesNotMatch(rootPage, /href="https:\/\/chat\.whatsapp\.com\/Lqv7ZVbC3PPBmQNMjRoXaM"/);
assert.match(welcome, /chat\.whatsapp\.com\/Lqv7ZVbC3PPBmQNMjRoXaM/, "the WhatsApp destination outside the landing-page social footer must remain available");
for (const color of ["#010c18", "#03101d", "#c79341", "#e5b55b", "#186059", "#298075", "#ebe9de", "#fdfaf2"]) {
  assert.match(conflictTheme.toLowerCase(), new RegExp(color));
}

console.log("Website/app parity validation passed for Bible Guides, native Bible reading, highlight notes, Zoom links, and the FaithCraft-only theme.");
