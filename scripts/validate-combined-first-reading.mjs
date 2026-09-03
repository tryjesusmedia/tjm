import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const planUrl = new URL("../bibleandconflictoftheages/data/readings.json", import.meta.url);
const appUrl = new URL("../bibleandconflictoftheages/app.js", import.meta.url);
const importerUrl = new URL("./import-conflict-reading-plans.mjs", import.meta.url);
const plan = JSON.parse(await readFile(planUrl, "utf8"));
const appSource = await readFile(appUrl, "utf8");
const importerSource = await readFile(importerUrl, "utf8");

const expectedSourceEntry = [
  "Gen 1; 2",
  "Ch 1—Why was Sin Permitted? PP 33-43",
  "Ch 2—The Creation PP 44-51",
].join("\n");
const expectedCommentary = [
  "Ch 1—Why was Sin Permitted? PP 33-43",
  "Ch 2—The Creation PP 44-51",
].join(" · ");

assert.equal(plan.planId, "bible-conflict-ages-v1");
assert.equal(plan.readings.length, 264, "Combining the first two assignments should leave 264 readings.");
assert.deepEqual(plan.readingAliases, { "coa-002": "coa-001" });

const first = plan.readings[0];
assert.equal(first.id, "coa-001", "The combined assignment must retain the first reading's stable ID.");
assert.equal(first.day, 1);
assert.equal(first.code, "PP");
assert.equal(first.sourceKey, "PP:1+2");
assert.equal(first.sourceEntry, expectedSourceEntry);
assert.equal(first.title, "Why was Sin Permitted? · The Creation");
assert.equal(first.bibleReference, "Gen 1; 2");
assert.equal(first.bibleQuery, "Gen 1; 2");
assert.deepEqual(first.bibleTasks.map(({ reference }) => reference), ["Genesis 1", "Genesis 2"]);
assert.deepEqual(first.bibleTasks.map(({ legacyProgressIndex }) => legacyProgressIndex), [1, 2]);
assert.equal(first.commentaryCitation, expectedCommentary);
assert.equal(first.commentaryPageStart, 33);
assert.equal(first.commentaryPageEnd, 51);
assert.deepEqual(first.commentaryTasks.map(({ chapterNumber }) => chapterNumber), [1, 2]);
assert.deepEqual(first.commentaryTasks.map(({ legacyProgressIndex }) => legacyProgressIndex), [0, 3]);
assert.equal(first.correctionApplied, true);
assert.match(first.originalSourceEntry, /Why was Sin Permitted\?/);
assert.match(first.originalSourceEntry, /The Creation/);
assert.equal(first.reviewNote, null);

assert.equal(plan.readings.some(({ id }) => id === "coa-002"), false, "The retired second reading ID must not remain as a separate assignment.");
assert.equal(plan.readings[1].id, "coa-003", "Existing reading IDs must remain stable so saved progress and principles are not remapped.");
assert.equal(plan.readings[1].day, 2);
assert.deepEqual(plan.readings.map(({ day }) => day), Array.from({ length: plan.readings.length }, (_, index) => index + 1));
assert.equal(new Set(plan.readings.map(({ id }) => id)).size, plan.readings.length);

const pp = plan.books.find(({ code }) => code === "PP");
assert.equal(pp?.readingCount, 66);
assert.equal(plan.books.reduce((total, book) => total + book.readingCount, 0), plan.readings.length);

assert.match(appSource, /function resolveReadingId\(readingId\)/);
assert.match(appSource, /function readingIdsFor\(readingId\)/);
assert.match(appSource, /getReadings:\s*\(\)\s*=>\s*readingsWithAliases\(\)/);
assert.match(appSource, /legacyProgressIndex/);
assert.doesNotMatch(appSource, /plan\.readings\.length !== 265/);
assert.match(appSource, /declaredReadingCount/);
assert.match(appSource, /CONFIG\.siteUrl \|\|/);
assert.match(importerSource, /function combineOpeningPpReadings\(items\)/);
assert.match(importerSource, /readingAliases:\s*\{\s*"coa-002":\s*"coa-001"\s*\}/);

console.log("Combined first Conflict of the Ages reading validation passed.");
