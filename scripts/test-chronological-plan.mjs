import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const plan = JSON.parse(await readFile(new URL("../chronbible/data/readings.json", import.meta.url), "utf8"));
const html = await readFile(new URL("../chronbible/index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../chronbible/app.js", import.meta.url), "utf8");
const config = await readFile(new URL("../chronbible/config.js", import.meta.url), "utf8");
const principleTools = await readFile(new URL("../lib/principles.js", import.meta.url), "utf8");
const principleMap = await readFile(new URL("../lib/principles-folders-flow.mjs", import.meta.url), "utf8");

assert.equal(plan.planId, "chronological-bible-order-v4");
assert.equal(plan.notesPlanId, "chronological-bible-order-v3");
assert.equal(plan.previousPlanId, "chronological-bible-order-v3");
assert.equal(plan.legacyPlanId, "chronological-bible-order-v3");
assert.equal(plan.taskLegacyPlanId, "chronological-bible-order-v2");
assert.equal(plan.originalLegacyPlanId, "chronological-bible-order-v1");
assert.equal(plan.originalReadingCount, 150);
assert.equal(plan.readingCount, 313);
assert.equal(plan.readings.length, 313);
assert.equal(plan.sections.length, 11);
assert.equal(plan.sections[0].readingCount, 9);
assert.equal(plan.chapterCount, 1205);
assert.equal(plan.readings[0].reference, "Genesis 1-3");
assert.equal(plan.readings[3].reference, "Genesis 10-11");
assert.deepEqual(plan.readings.slice(4, 9).map((reading) => reading.reference), ["Job 1-8", "Job 9-16", "Job 17-24", "Job 25-34", "Job 35-42"]);
assert.equal(plan.readings[9].reference, "Genesis 12-17");
assert.deepEqual(plan.readings.filter((reading) => reading.sourceNumber === 1).flatMap((reading) => reading.bibleTasks.map((task) => task.label)), Array.from({ length: 42 }, (_, index) => `Job ${index + 1}`));
assert.equal(plan.readings.at(-1).reference, "Revelation 21-22");
assert.deepEqual(plan.readings.map((reading) => reading.index), Array.from({ length: 313 }, (_, index) => index));
assert.deepEqual(plan.readings.map((reading) => reading.number), Array.from({ length: 313 }, (_, index) => index + 1));
assert.ok(plan.readings.every((reading) => reading.title && reading.sourceReference));
assert.ok(plan.readings.every((reading) => reading.bibleTasks.length >= 1 && reading.bibleTasks.length <= 10));
assert.ok(plan.readings.every((reading) => reading.bibleTasks.every((task) => task.url.startsWith("https://www.biblegateway.com/passage/") && task.url.includes("version=KJV"))));
const chapterTasks = plan.readings.flatMap((reading) => reading.bibleTasks);
assert.deepEqual(chapterTasks.filter((task) => /^Job /.test(task.label)).map((task) => task.label), Array.from({ length: 42 }, (_, index) => `Job ${index + 1}`));
assert.deepEqual(chapterTasks.map((task) => task.progressIndex), Array.from({ length: 1205 }, (_, index) => index));
assert.ok(plan.readings.some((reading) => reading.sourceReference === "2 Kings 1-8-13; 2 Chronicles 24" && reading.reviewNote));
assert.equal(Object.keys(plan.legacyMigration).length, 150);
assert.deepEqual(Object.values(plan.legacyMigration).flat().sort((left, right) => left - right), Array.from({ length: 313 }, (_, index) => index));
assert.equal(Object.keys(plan.taskChapterMigration).length, 309);
assert.equal(Object.values(plan.taskChapterMigration).flat().length, 1166);
assert.equal(Object.keys(plan.currentTaskChapterMigration).length, 313);
assert.deepEqual(Object.values(plan.currentTaskChapterMigration).flat(), Array.from({ length: 1205 }, (_, index) => index));
assert.equal(Object.keys(plan.previousChapterMigration).length, 1166);
assert.equal(new Set(Object.values(plan.previousChapterMigration)).size, 1166);
assert.equal(Object.keys(plan.previousReadingMigration).length, 309);
assert.equal(new Set(Object.values(plan.previousReadingMigration)).size, 309);
assert.equal(Object.keys(plan.taskReadingMigration).length, 309);
assert.equal(Object.keys(plan.originalChapterMigration).length, 150);
assert.equal(Object.keys(plan.originalReadingMigration).length, 150);
assert.equal(plan.previousChapterMigration[0], 11);
assert.equal(plan.previousChapterMigration[1], 12);
assert.equal(plan.previousChapterMigration[2], 52);
assert.equal(plan.previousChapterMigration[3], 0);
assert.equal(plan.previousReadingMigration[0], 4);
assert.equal(plan.previousReadingMigration[1], 0);
assert.equal(plan.previousReadingMigration[5], 9);
assert.deepEqual(plan.taskChapterMigration[0], [11, 12, 52]);
assert.deepEqual(plan.originalChapterMigration[0], [11, 12, 52]);
assert.deepEqual(plan.originalReadingMigration[0], { first: 4, last: 8, resume: 4 });
assert.deepEqual(plan.originalReadingMigration[1], { first: 0, last: 3, resume: 3 });
for (const [legacyIndex, readingIndices] of Object.entries(plan.legacyMigration)) {
  const completedChapters = new Set(plan.originalChapterMigration[legacyIndex] ?? []);
  const expectedResume = readingIndices.find((readingIndex) => (
    plan.currentTaskChapterMigration[String(readingIndex)] ?? []
  ).some((chapterIndex) => !completedChapters.has(chapterIndex))) ?? readingIndices.at(-1);
  assert.deepEqual(plan.originalReadingMigration[legacyIndex], {
    first: readingIndices[0],
    last: readingIndices.at(-1),
    resume: expectedResume,
  });
}
assert.deepEqual(Object.values(plan.taskChapterMigration).flat(), Object.values(plan.previousChapterMigration));
assert.deepEqual(plan.taskReadingMigration, plan.previousReadingMigration);
assert.deepEqual(plan.readings.filter((reading) => reading.sourceNumber === 2).map((reading) => reading.reference), ["Genesis 1-3", "Genesis 4-5", "Genesis 6-9", "Genesis 10-11"]);
assert.deepEqual(plan.readings.filter((reading) => reading.sourceNumber === 150).map((reading) => reading.title), ["The Revelation of Jesus Christ", "The Seven Churches", "The Throne, the Lamb, and the Scroll", "The Seals", "The Trumpets and Two Witnesses", "The Dragon, the Beasts, and the Lamb", "The Seven Bowls", "Babylon's Fall", "Christ's Victory and Final Judgment", "New Jerusalem and Eternal Restoration"]);
assert.match(html, /GOOGLE SIGN-IN IS OPTIONAL/);
assert.match(html, /Progress and principles can only be saved and synced after you sign in/);
assert.doesNotMatch(html, /data-view="principles"/);
assert.doesNotMatch(html, /data-view="members"/);
assert.match(app, /reading_plan_progress/);
assert.match(app, /data-chapter-progress/);
assert.match(app, /migrateV3Progress/);
assert.match(app, /migrateV2Progress/);
assert.match(app, /migrateV1Progress/);
assert.match(app, /completedLegacy\.has\(lastLegacyIndex\) \? \(readingMigration\.resume \?\? readingMigration\.last\) : readingMigration\.first/);
assert.match(principleTools, /create_conflict_principle/);
assert.match(app, /principleManager\.renderCreateNumberField/);
assert.match(app, /principleManager\.renderReadingPrinciple/);
for (const feature of ["update_conflict_principle", "move_conflict_principle", "bulk_update_conflict_principles", "Download spreadsheet", "Go to reading", "data-principle-menu", "data-principle-search-next"]) assert.match(principleTools, new RegExp(feature));
assert.doesNotMatch(app, /View (?:original )?supplied assignment/i);
assert.match(config, /planId: "chronological-bible-order-v4"/);
assert.match(config, /notesPlanId: "chronological-bible-order-v3"/);
assert.match(config, /principles-folders-flow\.mjs\?v=20260911-1/);
assert.match(html, /config\.js\?v=20260911-1/);
assert.match(app, /CONFIG\.notesPlanId/);
assert.match(principleMap, /CONFIG\?\.notesPlanId \|\| CONFIG\?\.planId/);
assert.doesNotMatch(app, /remain in their exact order/i);

console.log(`Chronological plan validated: ${plan.readings.length} named tasks, ${plan.chapterCount} individually trackable chapters, and editable grouped principles across ${plan.sections.length} sections.`);
