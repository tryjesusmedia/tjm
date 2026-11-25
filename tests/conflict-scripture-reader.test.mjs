import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const plan = JSON.parse(readFileSync('bibleandconflictoftheages/data/readings.json'));
const amendments = readFileSync('bibleandconflictoftheages/scripture-amendments.js', 'utf8');
function amendedPlan() {
  const window = {};
  vm.runInNewContext(amendments, { window });
  return window.TJM_applyConflictScriptureAmendments(structuredClone(plan));
}
const chronPlan = JSON.parse(readFileSync('chronbible/data/readings.json'));
const headings = JSON.parse(readFileSync('chronbible/read/headings.json'));
const script = readFileSync('chronbible/read/reader.js', 'utf8');

function reader(url = '/chronbible/read/') {
  const nodes = new Map();
  let redirected;
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {
      listeners: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(name, listener) { this.listeners[name] = listener; },
      setAttribute() {}, removeAttribute() {}, setProperty() {},
    });
    return nodes.get(id);
  }
  const location = new URL(url, 'https://example.test');
  location.replace = path => { redirected = path; };
  const sandbox = {
    window: { location, TJM_CHRONBIBLE_CONFIG: { planId: chronPlan.planId } },
    location, navigator: {}, URLSearchParams, AbortController,
    document: { getElementById: node, querySelector: () => null, addEventListener() {},
      documentElement: { style: node('style') }, body: node('body') },
    localStorage: { getItem: () => null, setItem() {} },
    sessionStorage: { setItem() {} }, setTimeout() {},
    console: { warn() {} },
    async fetch(path) {
      let data;
      if (path.endsWith('/headings.json')) data = headings;
      else if (path.startsWith('/bibleandconflictoftheages/')) data = structuredClone(plan);
      else if (path === '/chronbible/data/readings.json') data = chronPlan;
      else data = JSON.parse(readFileSync('.' + path));
      return { ok: true, json: async () => data };
    },
  };
  vm.runInNewContext(amendments, sandbox);
  vm.runInNewContext(script.replace('  void init();',
    '  globalThis.reader = {init, fetchScripture, parsePassage};'), sandbox);
  return { ...sandbox.reader, node, redirectedTo: () => redirected };
}

test('1,373 Conflict Scripture choices open exact chapters and ranges in both translations', async () => {
  const { fetchScripture, parsePassage } = reader();
  let choices = 0;
  for (const reading of plan.readings) {
    for (const task of reading.bibleTasks) {
      const ref = parsePassage(task.reference);
      assert.equal(ref.chapter, task.chapter);
      for (const version of ['web', 'kjv']) {
        const data = await fetchScripture({ label: task.reference }, version);
        const book = JSON.parse(readFileSync(`chronbible/read/text/${version}/${ref.book}.json`));
        const parts = task.reference.split(':')[1]?.split(',').map(segment => {
          const [start, end = start] = segment.trim().split('-').map(Number);
          return [start, end];
        });
        const expected = book.chapters[task.chapter - 1].verses
          .filter(verse => !parts || parts.some(([start, end]) => verse.number >= start && verse.number <= end));
        assert.deepEqual(Array.from(data.verses, verse => [verse.verse, verse.text]),
          expected.map(verse => [verse.number, verse.text]), `${version}: ${task.reference}`);
      }
      choices++;
    }
  }
  assert.equal(choices, 1373);
});

test('shared UI loads one assignment, preserves its gaps in KJV, and points back to Conflict', async () => {
  const ref = 'Genesis 25:1-11, 19-34';
  const reading = plan.readings.find(item => item.bibleTasks.some(task => task.reference === ref));
  const index = reading.bibleTasks.findIndex(task => task.reference === ref);
  const { init, node } = reader(`/chronbible/read/?plan=conflict&reading=${reading.id}&passage=${index}`);
  await init();
  const verseNumbers = () => [...node('task-verses-0').innerHTML.matchAll(/aria-label="Verse (\d+)"/g)].map(m => Number(m[1]));
  assert.equal(node('header-passage').textContent, ref);
  assert.equal(node('reader-back').href, '/bibleandconflictoftheages/?reading=' + reading.id);
  assert.equal(node('reading-progress').hidden, true);
  assert.equal((node('reader-passages').innerHTML.match(/<article /g) || []).length, 1);
  assert.match(node('task-verses-0').innerHTML, /scripture-topic/);
  const expected = [...Array.from({length: 11}, (_, i) => i + 1), ...Array.from({length: 16}, (_, i) => i + 19)];
  assert.deepEqual(verseNumbers(), expected);
  node('translation-switch').listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(node('task-status-0').textContent, 'KJV');
  assert.deepEqual(verseNumbers(), expected);
});

test('invalid Conflict passage never falls through to ChronBible', async () => {
  const { init, node, redirectedTo } = reader('/chronbible/read/?plan=conflict&reading=coa-001&passage=9999');
  await init();
  assert.match(node('reader-status').textContent, /not part of the selected Bible and Conflict reading/);
  assert.equal(node('reader-back').href, '/bibleandconflictoftheages/');
  assert.equal(redirectedTo(), undefined);
});

test('existing ChronBible single-passage and legacy overview URLs are unchanged', async () => {
  const single = reader('/chronbible/read/?reading=1&passage=0');
  await single.init();
  assert.equal(single.node('reader-back').href, '/chronbible/?reading=1');
  assert.equal(single.node('header-passage').textContent, 'Genesis 1');
  assert.match(single.node('task-verses-0').innerHTML, /God Creates the Heavens and Earth/);
  const legacy = reader('/chronbible/read/?reading=1');
  await legacy.init();
  assert.equal(legacy.redirectedTo(), '/chronbible/?reading=1');
});

test('overview links point to one Scripture assignment and retain the exact EGW link markup', () => {
  const overview = readFileSync('bibleandconflictoftheages/app.js', 'utf8');
  const source = (name, next) => overview.slice(overview.indexOf('function ' + name), overview.indexOf('function ' + next));
  const sandbox = vm.createContext({ chapterCompleted: new Set() });
  vm.runInContext(source('escapeHTML', 'displayName') + source('sourceTaskLinks', 'metadataFirstName'), sandbox);
  let companionChoices = 0;
  for (const reading of plan.readings) {
    const links = sandbox.sourceTaskLinks(reading, 'bible', reading.bibleTasks);
    const hrefs = [...links.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(hrefs, reading.bibleTasks.map((_, i) =>
      `/chronbible/read/?plan=conflict&amp;reading=${reading.id}&amp;passage=${i}`));
    assert.doesNotMatch(links, /target="_blank"/);
    const companions = sandbox.sourceTaskLinks(reading, 'commentary', reading.commentaryTasks);
    const egwHrefs = [...companions.matchAll(/href="([^"]+)" target="_blank" rel="noopener noreferrer"/g)]
      .map(m => m[1].replaceAll('&amp;', '&'));
    assert.deepEqual(egwHrefs, reading.commentaryTasks.map(task => task.url));
    companionChoices += egwHrefs.length;
  }
  assert.equal(companionChoices, 323);
});

test('approved additions fill exactly the missing source verses in WEB and KJV', () => {
  const { parsePassage } = reader();
  const corrected = amendedPlan();
  for (const version of ['web', 'kjv']) {
    const books = new Map();
    const all = new Set();
    for (const book of new Set(plan.readings.flatMap(r => r.bibleTasks.map(t => parsePassage(t.reference).book)))) {
      const data = JSON.parse(readFileSync(`chronbible/read/text/${version}/${book}.json`));
      books.set(book, data.chapters);
      for (const [i, chapter] of data.chapters.entries()) {
        for (const verse of chapter.verses) all.add(`${book}:${i + 1}:${verse.number}`);
      }
    }
    const coverage = input => {
      const assigned = new Set();
      for (const r of input.readings) for (const task of [...r.bibleTasks, ...(r.supplementalBibleTasks ?? [])]) {
        const ref = parsePassage(task.reference);
        const ranges = task.reference.split(':')[1]?.split(',').map(part => {
          const [start, end = start] = part.trim().split('-').map(Number);
          return [start, end];
        });
        for (const v of books.get(ref.book)[ref.chapter - 1].verses) {
          if (!ranges || ranges.some(([start, end]) => v.number >= start && v.number <= end)) {
            assigned.add(`${ref.book}:${ref.chapter}:${v.number}`);
          }
        }
      }
      return [...all].filter(v => !assigned.has(v));
    };
    assert.equal(books.size, 66);
    assert.equal(coverage(plan).length, 23);
    assert.deepEqual(coverage(corrected), [], version);
  }
});

test('corrected Scripture links open exact WEB and KJV ranges without renumbering the originals', async () => {
  for (const [id, key, ref, first, last] of [
    ['coa-170', 'luke-9-37-45', 'Luke 9:37-45', 37, 45],
    ['coa-185', 4, 'John 12:1-11', 1, 11],
    ['coa-188', 'mark-11-27-33', 'Mark 11:27-33', 27, 33],
    ['coa-188', 'luke-19-45-48', 'Luke 19:45-48', 45, 48],
  ]) {
    const { init, node } = reader(`/chronbible/read/?plan=conflict&reading=${id}&passage=${key}`);
    await init();
    assert.equal(node('header-passage').textContent, ref);
    assert.equal(node('reader-back').href, '/bibleandconflictoftheages/?reading=' + id);
    const expected = Array.from({ length: last - first + 1 }, (_, i) => first + i);
    const verses = () => [...node('task-verses-0').innerHTML.matchAll(/aria-label="Verse (\d+)"/g)].map(m => Number(m[1]));
    assert.deepEqual(verses(), expected);
    node('translation-switch').listeners.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(node('task-status-0').textContent, 'KJV');
    assert.deepEqual(verses(), expected);
  }
});

test('overview exposes all new links without changing any historical checkbox index, link or companion', () => {
  const overview = readFileSync('bibleandconflictoftheages/app.js', 'utf8');
  const source = (name, next) => overview.slice(overview.indexOf('function ' + name), overview.indexOf('function ' + next));
  const sandbox = vm.createContext({chapterCompleted: new Set([1309]), plan: null, chapterTaskCount: 0});
  vm.runInContext(source('prepareChapterProgressIndex', 'taskGroupComplete') +
    source('escapeHTML', 'displayName') + source('sourceTaskLinks', 'metadataFirstName'), sandbox);
  const baseline = structuredClone(plan);
  const corrected = amendedPlan();
  for (const candidate of [baseline, corrected]) {
    sandbox.plan = candidate;
    sandbox.prepareChapterProgressIndex();
    assert.equal(sandbox.chapterTaskCount, 1696);
  }
  let additions = 0;
  const hrefs = markup => [...markup.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
  const checkboxes = markup => [...markup.matchAll(/data-chapter-progress="(\d+)"/g)].map(m => m[1]);
  for (const [i, before] of baseline.readings.entries()) {
    const after = corrected.readings[i];
    assert.equal(after.id, before.id);
    assert.deepEqual(after.commentaryTasks, before.commentaryTasks);
    const render = r => sandbox.sourceTaskLinks(r, 'bible', r.bibleTasks);
    assert.deepEqual(checkboxes(render(after)), checkboxes(render(before)));
    const links = hrefs(render(after));
    assert.deepEqual(links.filter(href => /passage=\d+$/.test(href)), hrefs(render(before)));
    for (const extra of after.supplementalBibleTasks ?? []) {
      assert.ok(links.includes(`/chronbible/read/?plan=conflict&amp;reading=${after.id}&amp;passage=${extra.key}`));
      additions++;
    }
  }
  assert.equal(additions, 3);
  assert.match(sandbox.sourceTaskLinks(corrected.readings[183], 'bible', corrected.readings[183].bibleTasks), /data-chapter-progress="1309"[^>]*aria-label="Mark John 12:1-11 complete" checked/);
});
