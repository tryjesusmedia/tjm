import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const websitePlan = JSON.parse(await readFile(new URL("../bibleandconflictoftheages/data/readings.json", import.meta.url), "utf8"));
const appPlan = JSON.parse(await readFile(new URL("../../tryjesusjourney/data/conflictPlan.json", import.meta.url), "utf8"));
const html = await readFile(new URL("../bibleandconflictoftheages/index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../bibleandconflictoftheages/app.js", import.meta.url), "utf8");

assert.deepEqual(appPlan, websitePlan, "The website and native app plan bundles must match exactly");
assert.equal(websitePlan.planId, "bible-conflict-ages-v1");
assert.equal(websitePlan.readings.length, 265);
assert.deepEqual(Object.fromEntries(websitePlan.books.map((book) => [book.code, book.readingCount])), { PP: 67, PK: 60, DA: 82, AA: 44, GC: 12 });
assert.equal(websitePlan.reviewQueue.length, 13);
assert.deepEqual(websitePlan.reviewQueue.map((item) => item.sourceKey), ["PP:5", "PP:6", "PP:7", "PP:26", "PK:8", "PK:30", "PK:62", "DA:32", "DA:39", "DA:40", "DA:43", "DA:51", "DA:77"]);

for (const [index, reading] of websitePlan.readings.entries()) {
  assert.equal(reading.id, `coa-${String(index + 1).padStart(3, "0")}`);
  assert.equal(reading.day, index + 1);
  assert.ok(reading.sourceEntry, `Day ${reading.day} must preserve its supplied source block`);
  assert.ok(reading.bibleReference || reading.commentaryCitation, `Day ${reading.day} must have at least one assignment`);
  if (reading.bibleUrl) {
    const bible = new URL(reading.bibleUrl);
    assert.equal(bible.hostname, "www.biblegateway.com");
    assert.ok(bible.searchParams.get("search"));
    assert.equal(bible.searchParams.get("version"), "KJV");
  }
  if (reading.commentaryCitation) {
    const commentary = new URL(reading.commentaryUrl);
    assert.equal(commentary.hostname, "m.egwwritings.org");
    assert.ok(commentary.searchParams.get("query"));
  }
}

for (const sourceKey of ["PP:26", "DA:39", "DA:40", "DA:43", "DA:51"]) {
  assert.equal(websitePlan.readings.find((reading) => reading.sourceKey === sourceKey).bibleUrl, null, `${sourceKey} must not silently link a guessed correction`);
}

assert.match(websitePlan.readings.find((reading) => reading.sourceKey === "PP:26").sourceEntry, /Ex 42-34/);
assert.match(websitePlan.readings.find((reading) => reading.sourceKey === "DA:39").sourceEntry, /Matthew 15-21-28/);
assert.equal(websitePlan.readings.at(-1).bibleReference, "Revelation 21; 22");
assert.match(websitePlan.readings.at(-1).commentaryCitation, /GC 662-678/);

for (const label of ["Today", "Journey", "Calendar", "Progress", "Members", "Continue with Google", "Explore without saving", "Sign in to save"]) assert.match(html, new RegExp(label, "i"));
assert.match(app, /Viewing without an account/);
assert.match(app, /saved only after you sign in/);
assert.doesNotMatch(`${html}\n${app}`, /Ask Pastor Kal/i);
assert.match(app, /conflict_reading_progress/);
assert.match(app, /create_conflict_principle/);

console.log("Conflict journey validation passed: 265 readings, exact app/web parity, 13 review flags, and safe outbound links.");
