import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const plan = JSON.parse(await readFile(new URL("../chronbible/data/readings.json", import.meta.url), "utf8"));
const html = await readFile(new URL("../chronbible/index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../chronbible/app.js", import.meta.url), "utf8");

assert.equal(plan.planId, "chronological-bible-order-v1");
assert.equal(plan.readingCount, 150);
assert.equal(plan.readings.length, 150);
assert.equal(plan.sections.length, 11);
assert.equal(plan.readings[0].reference, "Job (1st two chapters and last chapter)");
assert.equal(plan.readings.at(-1).reference, "Revelation");
assert.deepEqual(plan.readings.map((reading) => reading.index), Array.from({ length: 150 }, (_, index) => index));
assert.deepEqual(plan.readings.map((reading) => reading.number), Array.from({ length: 150 }, (_, index) => index + 1));
assert.ok(plan.readings.every((reading) => reading.bibleTasks.length > 0));
assert.ok(plan.readings.every((reading) => reading.bibleTasks.every((task) => task.url.startsWith("https://www.biblegateway.com/passage/") && task.url.includes("version=KJV"))));
assert.ok(plan.readings.some((reading) => reading.reference === "2 Kings 1-8-13; 2 Chronicles 24" && reading.reviewNote));
assert.match(html, /GOOGLE SIGN-IN IS OPTIONAL/);
assert.match(html, /Progress can only be saved and synced after you sign in/);
assert.match(app, /reading_plan_progress/);
assert.match(app, /chronological-bible-order-v1|CONFIG\.planId/);

console.log(`Chronological plan validated: ${plan.readings.length} readings across ${plan.sections.length} sections.`);
