import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const source = await readFile(new URL("../lib/native-bible-reader.js", import.meta.url), "utf8");
const window = {};
const document = { addEventListener() {} };
vm.runInNewContext(source, { window, document, localStorage: null, console, setTimeout, clearTimeout, URLSearchParams });

const parse = (reference) => JSON.parse(JSON.stringify(window.TJMNativeBible.parsePassage(reference)));

assert.deepEqual(parse("Genesis 25:1-11, 19-34"), [
  { chapterLabel: "Genesis 25", ranges: [{ start: 1, end: 11 }, { start: 19, end: 34 }] },
]);
assert.deepEqual(parse("Isaiah 52:13-53:12"), [
  { chapterLabel: "Isaiah 52", ranges: [{ start: 13, end: Number.MAX_SAFE_INTEGER }] },
  { chapterLabel: "Isaiah 53", ranges: [{ start: 1, end: 12 }] },
]);
assert.deepEqual(parse("2 Samuel 14:25-26; 15:1-6"), [
  { chapterLabel: "2 Samuel 14", ranges: [{ start: 25, end: 26 }] },
  { chapterLabel: "2 Samuel 15", ranges: [{ start: 1, end: 6 }] },
]);
assert.deepEqual(parse("2 John 7-11"), [
  { chapterLabel: "2 John 1", ranges: [{ start: 7, end: 11 }] },
]);
assert.deepEqual(parse("Jude 5, 7-9"), [
  { chapterLabel: "Jude 1", ranges: [{ start: 5, end: 5 }, { start: 7, end: 9 }] },
]);
assert.deepEqual(parse("Obadiah"), [{ chapterLabel: "Obadiah 1", ranges: null }]);
for (const book of ["Obadiah", "Philemon", "2 John", "3 John", "Jude"]) {
  assert.deepEqual(parse(`${book} 1`), [{ chapterLabel: `${book} 1`, ranges: null }], `${book} 1 must open its complete one-chapter book`);
}
assert.deepEqual(parse("Psalms 1-2"), [
  { chapterLabel: "Psalms 1", ranges: null },
  { chapterLabel: "Psalms 2", ranges: null },
]);

const root = new URL("../", import.meta.url);
const kjv = JSON.parse(await readFile(new URL("../assets/bible/kjv.json", import.meta.url), "utf8"));
const web = JSON.parse(await readFile(new URL("../assets/bible/web.json", import.meta.url), "utf8"));
assert.equal(Object.keys(kjv.chapters).length, 1189);
assert.equal(Object.values(kjv.chapters).reduce((total, verses) => total + verses.length, 0), 31102);
assert.equal(Object.keys(web.chapters).length, 1189);
assert.equal(Object.values(web.chapters).reduce((total, verses) => total + verses.length, 0), 31103);
for (const [translation, corpus] of [["KJV", kjv], ["WEB", web]]) {
  for (const [chapterLabel, verses] of Object.entries(corpus.chapters)) {
    verses.forEach((verse, index) => assert.equal(verse.verse, index + 1, `${translation} gap at ${chapterLabel}:${index + 1}`));
  }
}
for (const chapterLabel of ["Exodus 1", "Leviticus 1", "Numbers 1", "Deuteronomy 1", "Joshua 1", "Judges 1", "Ruth 1", "1 Samuel 1"]) {
  assert.equal(kjv.chapters[chapterLabel][0].verse, 1, `KJV must include ${chapterLabel}:1`);
  assert.ok(kjv.chapters[chapterLabel][0].text, `KJV must include text for ${chapterLabel}:1`);
}

const assertReference = (reference, sourceLabel) => {
  const specs = parse(reference);
  assert.ok(specs.length, `${sourceLabel}: could not parse ${reference}`);
  for (const spec of specs) {
    assert.ok(kjv.chapters[spec.chapterLabel], `${sourceLabel}: KJV missing ${spec.chapterLabel} from ${reference}`);
    assert.ok(web.chapters[spec.chapterLabel], `${sourceLabel}: WEB missing ${spec.chapterLabel} from ${reference}`);
  }
};

for (const planName of ["chronbible", "bibleandconflictoftheages"]) {
  const plan = JSON.parse(await readFile(new URL(`../${planName}/data/readings.json`, import.meta.url), "utf8"));
  for (const reading of plan.readings) {
    for (const task of reading.bibleTasks || []) assertReference(task.label, `${planName}/${reading.id}`);
  }
}

for (const collection of ["get-to-know-jesus", "bible-prophecy"]) {
  const collectionPath = new URL(`../${collection}/`, import.meta.url);
  for (const entry of await readdir(collectionPath, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^guide\d+$/.test(entry.name)) continue;
    const html = await readFile(join(fileURLToPath(collectionPath), entry.name, "index.html"), "utf8");
    for (const match of html.matchAll(/href="(https:\/\/www\.biblegateway\.com\/passage\/\?[^\"]+)"/g)) {
      const url = new URL(match[1].replaceAll("&amp;", "&"));
      assertReference(url.searchParams.get("search"), `${collection}/${entry.name}`);
    }
  }
}

const genesisOne = kjv.chapters["Genesis 1"];
const genesisText = window.TJMNativeBible.offsetContract.chapterText(genesisOne);
const verseOne = genesisOne[0].text;
const verseTwo = genesisOne[1].text;
assert.equal(genesisText, genesisOne.map((verse) => verse.text).join("\n"));
assert.equal(genesisText.slice(0, verseOne.length), verseOne);
assert.equal(genesisText.slice(verseOne.length + 1, verseOne.length + 1 + verseTwo.length), verseTwo);
assert.equal(
  window.TJMNativeBible.offsetContract.referenceForOffsets(
    "Genesis 1",
    genesisOne,
    verseOne.length - 5,
    verseOne.length + 1 + 5,
  ),
  "Genesis 1:1-2",
);
assert.equal(window.TJMNativeBible.offsetContract.version, 1);
assert.equal(window.TJMNativeBible.offsetContract.separator, "\n");

const viewportTargetTop = window.TJMNativeBible.viewportContract.targetTop;
assert.equal(viewportTargetTop(640, -120, 580, -60), 640, "browser scroll anchoring must not move the reader");
assert.equal(viewportTargetTop(640, -120, 640, -80), 680, "layout changes above the reader must retain its viewport anchor");
assert.equal(viewportTargetTop(20, 40, 0, -10), 0, "restored scrolling must not move above the document");

const mergeDecision = window.TJMNativeBible.syncContract.mergeDecision;
const cached = { synced: true, updatedAt: "2026-09-10T12:00:00.000Z", deletedAt: "" };
const pending = { ...cached, synced: false };
const remoteOlder = { synced: true, updatedAt: "2026-09-09T12:00:00.000Z", deletedAt: "" };
const remoteDeleted = { ...remoteOlder, deletedAt: "2026-09-09T13:00:00.000Z" };
assert.equal(mergeDecision(cached, null), "drop", "a remotely deleted synced item must not be resurrected");
assert.equal(mergeDecision(pending, null), "upload", "a new offline item must upload");
assert.equal(mergeDecision(pending, remoteOlder), "upload", "a newer offline edit must upload");
assert.equal(mergeDecision({ ...pending, deletedAt: "2026-09-11T12:00:00.000Z" }, remoteOlder), "delete");
assert.equal(mergeDecision(pending, remoteDeleted), "remote-delete", "a server tombstone must beat a later stale-device edit");
assert.equal(mergeDecision({ ...pending, deletedAt: "2026-09-11T12:00:00.000Z" }, remoteDeleted), "remote-delete");
const deletionOwner = window.TJMNativeBible.syncContract.deletionOwner;
assert.equal(deletionOwner({ owner: "guest" }, "account-a", "account-a"), "account-a", "a linked guest deletion must bind to its account");
assert.equal(deletionOwner({ owner: "guest" }, "account-a", ""), "account-a", "an unclaimed guest deletion while signed in must bind to that account");
assert.equal(deletionOwner({ owner: "guest" }, "account-b", "account-a"), "account-a", "a pending migration must retain its original account binding");
assert.equal(deletionOwner({ owner: "guest" }, "", "account-a"), "account-a", "a linked deletion must survive a sign-out race");
assert.equal(deletionOwner({ owner: "guest" }, "", ""), "", "an ordinary guest-only deletion stays local");

const fetchAllRemoteRows = window.TJMNativeBible.syncContract.fetchAllRemoteRows;
const remoteFixture = Array.from({ length: 2505 }, (_, index) => ({ id: String(index).padStart(4, "0") }));
const pageCalls = [];
const pagedDb = {
  from(table) {
    assert.equal(table, "bible_highlights");
    const query = {
      select(columns) { assert.equal(columns, "*"); return query; },
      eq(column, value) { assert.equal(column, "user_id"); assert.equal(value, "account-a"); return query; },
      order(column, options) { assert.equal(column, "id"); assert.equal(options.ascending, true); return query; },
      range(from, to) {
        pageCalls.push([from, to]);
        return Promise.resolve({ data: remoteFixture.slice(from, to + 1), error: null });
      },
    };
    return query;
  },
};
assert.deepEqual(JSON.parse(JSON.stringify(await fetchAllRemoteRows(pagedDb, "account-a"))), remoteFixture);
assert.deepEqual(pageCalls, [[0, 999], [1000, 1999], [2000, 2999]], "sync must read every deterministic 1000-row page");
let failingPage = 0;
const failingDb = {
  from() {
    const query = {
      select() { return query; }, eq() { return query; }, order() { return query; },
      range() {
        failingPage += 1;
        return Promise.resolve(failingPage === 2 ? { data: null, error: new Error("page failed") } : { data: remoteFixture.slice(0, 1000), error: null });
      },
    };
    return query;
  },
};
await assert.rejects(fetchAllRemoteRows(failingDb, "account-a"), /page failed/, "a partial snapshot must never be returned for reconciliation");

const applySaveResponse = window.TJMNativeBible.syncContract.applySaveResponse;
const mutationId = "00000000-0000-4000-8000-000000000001";
const staleLocal = { updatedAt: "2026-09-11T12:00:00.000Z", clientMutationId: mutationId, deletedAt: "", note: "stale", synced: false };
const newerRemote = { ...staleLocal, updatedAt: "2026-09-11T13:00:00.000Z", note: "newer remote", synced: true };
assert.equal(applySaveResponse(staleLocal, newerRemote, "2026-09-11T12:00:00.000Z", mutationId), "remote-newer");
assert.equal(staleLocal.note, "newer remote", "a rejected stale write must adopt the row returned by the server trigger");
const laterLocal = { ...newerRemote, updatedAt: "2026-09-11T14:00:00.000Z", note: "later in-flight edit", synced: false };
assert.equal(applySaveResponse(laterLocal, newerRemote, "2026-09-11T12:00:00.000Z", mutationId), "local-newer");
assert.equal(laterLocal.note, "later in-flight edit", "a save response must not erase an even newer in-flight local edit");

const resolveGuestMigrationResponse = window.TJMNativeBible.syncContract.resolveGuestMigrationResponse;
const migrationCandidate = { id: "guest-id", owner: "guest", updatedAt: "2026-09-11T12:00:00.000Z", clientMutationId: mutationId, note: "before", synced: false };
const editedDuringMigration = { ...migrationCandidate, updatedAt: "2026-09-11T12:01:00.000Z", note: "edited while waiting" };
const migrationServerRow = { ...migrationCandidate, id: "server-id", owner: "account-a", synced: true };
const preservedGuestEdit = resolveGuestMigrationResponse(editedDuringMigration, migrationCandidate, migrationServerRow, "account-a");
assert.equal(preservedGuestEdit.id, "server-id");
assert.equal(preservedGuestEdit.owner, "account-a");
assert.equal(preservedGuestEdit.note, "edited while waiting");
assert.equal(preservedGuestEdit.synced, false, "an in-flight guest edit must be uploaded during normal reconciliation");
assert.equal(resolveGuestMigrationResponse(migrationCandidate, migrationCandidate, migrationServerRow, "account-a").note, "before");

const readerCss = await readFile(new URL("../lib/native-bible-reader.css", import.meta.url), "utf8");
assert.match(readerCss, /\.nbr-detail-columns\s*\{[^}]*grid-template-columns:\s*1fr 1fr/s);
assert.match(readerCss, /\.nbr-detail-pane\s*\{[^}]*overflow-y:\s*auto;[^}]*overflow-x:\s*hidden;/s);
const readerJs = await readFile(new URL("../lib/native-bible-reader.js", import.meta.url), "utf8");
assert.doesNotMatch(readerJs, /Select any words, then choose a highlight color\./);
assert.match(readerJs, /Choose a highlight color/);
assert.match(readerJs, /preserveContent: true/);
assert.match(readerJs, /captureReaderViewport/);
assert.match(readerJs, /restoreReaderViewport/);
assert.match(readerJs, /Highlight saved\. Tap highlighted words to add a note\./);
assert.match(readerJs, /closest\?\.\("\[data-highlight-id\]"\)/);
assert.match(readerJs, /role="button" tabindex="0" aria-label="Open highlight note"/);
assert.match(readerJs, /if \(!startGroup \|\| startGroup !== endGroup\) return;/, "a highlight cannot bridge hidden verses in discontiguous ranges");
assert.match(readerJs, /requestedUpdatedAt/);
assert.match(readerJs, /queueRemoteOperation/);
assert.match(readerJs, /LINK_TARGET_KEY/);
assert.match(readerJs, /includeId: Boolean\(existing\)/, "new guest rows must let Supabase assign an id while retries reuse the remote id");
assert.match(readerJs, /if \(item\.deletedAt\) row\.deleted_at = item\.deletedAt;/, "live upserts must not clear server tombstones");
assert.match(readerJs, /upsertRemoteTombstone/);
assert.match(readerJs, /onConflict: "user_id,client_mutation_id"/, "linked guest deletion must resolve a lost migration response by stable mutation id");
assert.match(readerJs, /mergedByMutation\.get\(local\.clientMutationId\)/, "response-loss recovery must merge the local tombstone with the server row even when their ids differ");
assert.ok((readerJs.match(/await fetchAllRemoteRows\(db, userId\)/g) || []).length >= 2, "initial and post-migration refreshes must both fetch all pages");
assert.doesNotMatch(readerJs, /from\("bible_highlights"\)\.delete\(/, "highlight rows must never be hard-deleted");
assert.ok(
  readerJs.indexOf('.select("*").eq("user_id", userId)') < readerJs.indexOf("const saved = await migrateGuestHighlight(db, userId, item"),
  "guest migration must inspect remote rows before writing",
);
assert.doesNotMatch(readerJs, /item\.clientMutationId\s*=\s*makeId\(\)/, "editing must preserve cross-client highlight identity");
assert.match(readerCss, /overflow-anchor:\s*none/);
assert.match(readerCss, /\.nbr-highlight-palette-label/);

const migrationSql = await readFile(new URL("../supabase/migrations/20260911000000_bible_highlights.sql", import.meta.url), "utf8");
assert.match(migrationSql, /deleted_at timestamptz/);
assert.match(migrationSql, /preserve_bible_highlight_tombstone/);
assert.match(migrationSql, /if new\.updated_at < old\.updated_at then\s+return old;/s, "the database must reject stale live-to-live writes");
assert.match(migrationSql, /revoke delete on public\.bible_highlights from authenticated/i);
assert.doesNotMatch(migrationSql, /create policy "Users can delete their own Bible highlights"/);

console.log("Native Bible passage parser tests passed.");
