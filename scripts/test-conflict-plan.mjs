import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const websitePlan = JSON.parse(await readFile(new URL("../bibleandconflictoftheages/data/readings.json", import.meta.url), "utf8"));
const html = await readFile(new URL("../bibleandconflictoftheages/index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../bibleandconflictoftheages/app.js", import.meta.url), "utf8");
const egwLinkMap = JSON.parse(await readFile(new URL("./egw-reading-links.json", import.meta.url), "utf8"));

assert.equal(websitePlan.planId, "bible-conflict-ages-v1");
assert.equal(websitePlan.readings.length, 264);
assert.deepEqual(Object.fromEntries(websitePlan.books.map((book) => [book.code, book.readingCount])), { PP: 66, PK: 60, DA: 82, AA: 44, GC: 12 });
assert.equal(websitePlan.reviewQueue.length, 0);
assert.equal(new Set(websitePlan.readings.map((reading) => reading.id)).size, websitePlan.readings.length);
const expectedEgwLinkKeys = new Set(websitePlan.readings.flatMap((reading) =>
  reading.sourceKey === "PP:1+2"
    ? ["PP:1", "PP:2"]
    : reading.commentaryCitation ? [reading.sourceKey] : []));
assert.equal(Object.keys(egwLinkMap).length, expectedEgwLinkKeys.size);
assert.deepEqual(new Set(Object.keys(egwLinkMap)), expectedEgwLinkKeys);
assert.equal(websitePlan.readings.reduce((count, reading) => count + reading.bibleTasks.length + reading.commentaryTasks.length, 0), 1696);
const progressTasks = websitePlan.readings.flatMap((reading) => [...reading.bibleTasks, ...reading.commentaryTasks]);
const reservedProgressIndices = new Set(progressTasks.map((task) => task.legacyProgressIndex).filter((index) => Number.isInteger(index) && index >= 0));
let nextProgressIndex = 0;
const assignedProgressIndices = progressTasks.map((task) => {
  if (Number.isInteger(task.legacyProgressIndex) && task.legacyProgressIndex >= 0) return task.legacyProgressIndex;
  while (reservedProgressIndices.has(nextProgressIndex)) nextProgressIndex += 1;
  const assigned = nextProgressIndex;
  nextProgressIndex += 1;
  return assigned;
});
assert.deepEqual([...assignedProgressIndices].sort((left, right) => left - right), Array.from({ length: 1696 }, (_, index) => index));

for (const [index, reading] of websitePlan.readings.entries()) {
  assert.match(reading.id, /^coa-\d{3}$/);
  assert.equal(reading.day, index + 1);
  assert.ok(reading.sourceEntry, `Reading ${reading.day} must preserve its supplied source block`);
  assert.ok(reading.bibleReference || reading.commentaryCitation, `Reading ${reading.day} must have at least one assignment`);
  if (reading.bibleReference) {
    assert.ok(reading.bibleTasks.length > 0, `Reading ${reading.day} must have chapter-level Scripture links`);
    assert.equal(reading.bibleUrl, reading.bibleTasks[0].url);
    for (const task of reading.bibleTasks) {
      assert.equal(task.label, `Read ${task.reference}`);
      assert.ok(Number.isInteger(task.chapter) && task.chapter > 0);
      const bible = new URL(task.url);
      assert.equal(bible.hostname, "www.biblegateway.com");
      assert.equal(bible.searchParams.get("search"), task.reference);
      assert.equal(bible.searchParams.get("version"), "KJV");
    }
  } else {
    assert.deepEqual(reading.bibleTasks, []);
    assert.equal(reading.bibleUrl, null);
  }
  if (reading.commentaryCitation) {
    assert.ok(reading.commentaryTasks.length > 0, `Reading ${reading.day} must have chapter-level companion links`);
    assert.equal(reading.commentaryUrl, reading.commentaryTasks[0].url);
    const mappedEgwLinks = reading.sourceKey === "PP:1+2"
      ? { ...egwLinkMap["PP:1"], chapters: [...egwLinkMap["PP:1"].chapters, ...egwLinkMap["PP:2"].chapters] }
      : egwLinkMap[reading.sourceKey];
    assert.deepEqual(reading.commentaryTasks.map(({ legacyProgressIndex, ...task }) => task), mappedEgwLinks.chapters);
    for (const task of reading.commentaryTasks) {
      const commentary = new URL(task.url);
      assert.match(task.label, /^Read (?:Chapter \d+|Introduction)$/);
      assert.ok(task.title, `Every ${reading.code} companion section must include its real title`);
      if (task.chapterNumber === null) {
        assert.match(task.title, /^Introduction—.+/, `${reading.code} introduction must include its name`);
      } else {
        assert.ok(Number.isInteger(task.chapterNumber) && task.chapterNumber > 0, `${reading.code} chapter number must be a positive integer`);
        assert.match(task.title, new RegExp(`^Chapter ${task.chapterNumber}—.+`), `${reading.code} chapter must include its number and name`);
      }
      assert.equal(commentary.hostname, "egwwritings.org");
      assert.equal(commentary.pathname, "/read");
      assert.match(commentary.searchParams.get("panels"), /^p\d+\.\d+$/);
      assert.equal(commentary.searchParams.get("index"), "0");
    }
    const commentary = new URL(reading.commentaryUrl);
    const expectedQuery = reading.commentaryPageStart
      ? `${reading.code} ${reading.commentaryPageStart}`
      : `${reading.commentaryBook} ${reading.commentaryCitation}`;
    assert.equal(commentary.hostname, "egwwritings.org");
    assert.equal(commentary.pathname, "/read");
    assert.match(commentary.searchParams.get("panels"), /^p\d+\.\d+$/);
    assert.equal(commentary.searchParams.get("index"), "0");
    assert.equal(commentary.href, mappedEgwLinks.url);
    assert.equal(mappedEgwLinks.query, expectedQuery);
  } else {
    assert.deepEqual(reading.commentaryTasks, []);
    assert.equal(reading.commentaryUrl, null);
  }
}

assert.equal(websitePlan.readings.find((reading) => reading.sourceKey === "PP:26").bibleReference, "Ex 32-34");
assert.match(websitePlan.readings.find((reading) => reading.sourceKey === "PP:26").originalSourceEntry, /Ex 42-34/);
assert.equal(websitePlan.readings.find((reading) => reading.sourceKey === "DA:39").bibleReference, "Matthew 15:21-28; Mark 7:24-30");
assert.match(websitePlan.readings.find((reading) => reading.sourceKey === "DA:39").originalSourceEntry, /Matthew 15-21-28/);
assert.match(websitePlan.readings.find((reading) => reading.sourceKey === "PP:37").commentaryCitation, /PP 433-437/);
assert.match(websitePlan.readings.find((reading) => reading.sourceKey === "PP:60").commentaryCitation, /PP 675-682.*PP 683-689/);
assert.match(websitePlan.readings.find((reading) => reading.sourceKey === "DA:43").commentaryCitation, /Chapter 47—Ministry, DA 426-431/);
assert.match(websitePlan.readings.find((reading) => reading.sourceKey === "DA:77").commentaryCitation, /Chapter 82—“Why Weepest Thou\?”, DA 788-794/);
assert.equal(websitePlan.readings.find((reading) => reading.sourceKey === "PK:62").bibleReference, "Ezekiel 34-48; Obadiah; Zechariah 11; 12; 14; Psalm 1-8; 10-21; 23-45; 47; 49-67; 70; 73-75; 77; 79; 81; 84-86; 89; 90; 92-101; 103; 106; 108-111; 113-125; 127-145; 147-150");
assert.equal(websitePlan.readings.at(-1).bibleReference, "Revelation 21; 22");
assert.match(websitePlan.readings.at(-1).commentaryCitation, /GC 662-678/);

for (const label of ["Journey", "Progress", "Leaderboard", "Continue with Google", "Explore without saving", "Sign in to save"]) assert.match(html, new RegExp(label, "i"));
assert.doesNotMatch(html, /id="hero-reading-count"|264\s+readings/i);
assert.doesNotMatch(html, /data-view="readings"/i);
assert.doesNotMatch(html, /data-view="principles"/);
assert.doesNotMatch(html, /data-view="members"/);
assert.doesNotMatch(html, /native-bible-reader/);
assert.doesNotMatch(html, />\s*(?:Today|Calendar)\s*</i);
assert.doesNotMatch(app, /["'`]Day \$\{/);
assert.match(app, /Viewing without an account/);
assert.match(app, /Sign in to sync your progress across devices/);
assert.match(app, /function companionPageSummary/);
assert.match(app, /const PK_PAGE_RANGES = new Map/);
assert.match(app, /kind === "commentary" \? taskTitle\.replace/);
assert.doesNotMatch(app, /Open on EGW Writings/);
assert.doesNotMatch(app, /Related principle numbers/);
assert.doesNotMatch(app, /companionHeading\(reading, "companion-chapter"\)/);
assert.doesNotMatch(app, /escapeHTML\(reading\.commentaryCitation\)/);
assert.doesNotMatch(app, /Task \$\{reading\.day\} of \$\{plan\.readings\.length\}/);
assert.match(app, />Previous<\/button>/);
assert.match(app, />Next<\/button>/);
assert.match(app, /const scriptureCard = reading\.bibleReference \?/);
assert.match(app, /href="\$\{escapeHTML\(task\.url\)\}"/);
assert.match(app, /target="_blank" rel="noopener noreferrer"/);
assert.match(app, /data-open-source="\$\{kind\}"/);
assert.match(app, /const reviewQueue = plan\.reviewQueue\?\.length/);
assert.match(app, /loadMemberData\(\{ preservePlace = false, userId = session\?\.user\?\.id, version = sessionVersion \} = \{\}\)/);
assert.match(app, /loadMemberData\(\{ preservePlace: true, userId, version \}\)/);
assert.match(app, /function renderPreservingPlace\(\)/);
assert.match(app, /BibleGateway/);
assert.doesNotMatch(app, /data-native-bible-task|TJMNativeBible|nbr-inline-reader|Choose a Scripture passage to read it here/);
assert.doesNotMatch(app, /Reading \$\{reading\.day\}/);
assert.doesNotMatch(`${html}\n${app}`, /Ask Pastor Kal/i);
assert.match(app, /conflict_reading_progress/);
assert.match(app, /bible-conflict-ages-chapters-v1/);
assert.match(app, /data-chapter-progress/);
assert.match(app, /reading_plan_progress/);
assert.doesNotMatch(app, /View supplied source entry/i);
assert.doesNotMatch(app, /Scripture complete|Companion complete/);
assert.doesNotMatch(`${html}\n${app}`, /principles-folders|TJMPrinciples|principleManager/);
assert.doesNotMatch(`${html}\n${app}`, /Bible highlights|highlights, and notes|keep notes|Your Bible notes/);
assert.match(html, /data-view="rewards"/);
assert.match(app, /const POINTS_PER_ITEM = 10/);
assert.match(app, /completedItems \* POINTS_PER_ITEM/);
assert.match(app, /\[1, 25, 100, 250, 500, 750, 1000, 1696\]/);
assert.match(app, /get_conflict_journey_leaderboard/);
assert.match(app, /get_my_journey_first_name/);
assert.match(app, /update_my_journey_first_name/);
assert.match(app, /const FIRST_NAME_HOLD_MS = 1400/);
assert.match(app, /data-edit-first-name/);
assert.match(app, /now - lastNameTapAt <= 500/);
assert.match(app, /window\.addEventListener\("pointermove"/);
assert.match(app, /window\.addEventListener\("pointerup"/);
assert.match(app, /window\.addEventListener\("pointercancel"/);
assert.match(app, /document\.addEventListener\("pointerout"/);
assert.match(app, /window\.addEventListener\("blur"/);
assert.match(app, /window\.addEventListener\("scroll"/);
assert.match(app, /setPointerCapture/);
assert.match(app, /releasePointerCapture/);
assert.match(app, /event\.repeat/);
assert.match(app, /nameEditRequestId/);
assert.match(app, /identityVersionAtStart !== identityVersion/);
assert.match(app, /cancelNameGesture\(\)/);
assert.match(app, /async function loadJourneyIdentity/);
assert.match(app, /loadJourneyIdentity\(\{ userId, version \}\)/);
assert.match(app, /data-edit-first-name"\) && event\.detail === 0/);
assert.match(app, /conflict_journey_settings"\)\.upsert\(defaultSettings/);
assert.match(app, /ignoreDuplicates:\s*true/);
assert.doesNotMatch(app, /addEventListener\("dblclick"/);
assert.match(app, /window\.addEventListener\("pageshow"/);
assert.match(app, /if \(name === "rewards" && session\) void refreshJourneyFromVisit\(\)/);
assert.match(app, /document\.addEventListener\("visibilitychange"/);
assert.match(app, /window\.addEventListener\("focus"/);
assert.match(app, /nameEditInProgress\) return false/);
assert.match(app, /sessionVersion/);
assert.match(app, /isCurrentSession\(userId, version\)/);
assert.match(app, /previousUserId !== nextUserId/);
assert.match(app, /resetRewardState\(\)/);
assert.match(app, /data-reroll-alias/);
assert.doesNotMatch(app, /not spiritual worth|YOUR COMMUNITY ALIAS|Change my alias|>Refresh<|Refreshing…|data-refresh-leaderboard/i);

console.log("Conflict journey validation passed: 264 readings, 1696 individually trackable chapters, external KJV and EGW links, and no unresolved review flags.");
