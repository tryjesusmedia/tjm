import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const plan = JSON.parse(await readFile(new URL("../chronbible/data/readings.json", import.meta.url), "utf8"));
const appPlan = JSON.parse(await readFile(new URL("../../tryjesusjourney/data/chronologicalBiblePlan.json", import.meta.url), "utf8"));
const html = await readFile(new URL("../chronbible/index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../chronbible/app.js", import.meta.url), "utf8");
const config = await readFile(new URL("../chronbible/config.js", import.meta.url), "utf8");

assert.deepEqual(appPlan, plan, "The website and native app chronological plans must match exactly");
assert.equal(plan.planId, "chronological-bible-order-v2");
assert.equal(plan.legacyPlanId, "chronological-bible-order-v1");
assert.equal(plan.originalReadingCount, 150);
assert.equal(plan.readingCount, 309);
assert.equal(plan.readings.length, 309);
assert.equal(plan.sections.length, 11);
assert.equal(plan.readings[0].reference, "Job (1st two chapters and last chapter)");
assert.equal(plan.readings.at(-1).reference, "Revelation 21-22");
assert.deepEqual(plan.readings.map((reading) => reading.index), Array.from({ length: 309 }, (_, index) => index));
assert.deepEqual(plan.readings.map((reading) => reading.number), Array.from({ length: 309 }, (_, index) => index + 1));
assert.ok(plan.readings.every((reading) => reading.title && reading.sourceReference));
assert.ok(plan.readings.every((reading) => reading.bibleTasks.length >= 1 && reading.bibleTasks.length <= 10));
assert.ok(plan.readings.every((reading) => reading.bibleTasks.every((task) => task.url.startsWith("https://www.biblegateway.com/passage/") && task.url.includes("version=KJV"))));
assert.ok(plan.readings.some((reading) => reading.sourceReference === "2 Kings 1-8-13; 2 Chronicles 24" && reading.reviewNote));
assert.equal(Object.keys(plan.legacyMigration).length, 150);
assert.deepEqual(Object.values(plan.legacyMigration).flat(), Array.from({ length: 309 }, (_, index) => index));
assert.deepEqual(plan.readings.filter((reading) => reading.sourceNumber === 2).map((reading) => reading.reference), ["Genesis 1-3", "Genesis 4-5", "Genesis 6-9", "Genesis 10-11"]);
assert.deepEqual(plan.readings.filter((reading) => reading.sourceNumber === 150).map((reading) => reading.title), ["The Revelation of Jesus Christ", "The Seven Churches", "The Throne, the Lamb, and the Scroll", "The Seals", "The Trumpets and Two Witnesses", "The Dragon, the Beasts, and the Lamb", "The Seven Bowls", "Babylon's Fall", "Christ's Victory and Final Judgment", "New Jerusalem and Eternal Restoration"]);
assert.match(html, /GOOGLE SIGN-IN IS OPTIONAL/);
assert.match(html, /Progress can only be saved and synced after you sign in/);
assert.match(app, /reading_plan_progress/);
assert.match(app, /migrateLegacyProgress/);
assert.match(config, /chronological-bible-order-v2/);

console.log(`Chronological plan validated: ${plan.readings.length} named tasks across ${plan.sections.length} sections; every task contains 1-10 chapters and web/app data match.`);
