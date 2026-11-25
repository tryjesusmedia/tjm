import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const plan = JSON.parse(readFileSync('bibleandconflictoftheages/data/readings.json'));
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
      else if (path.startsWith('/bibleandconflictoftheages/')) data = plan;
      else if (path === '/chronbible/data/readings.json') data = chronPlan;
      else data = JSON.parse(readFileSync('.' + path));
      return { ok: true, json: async () => data };
    },
  };
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
