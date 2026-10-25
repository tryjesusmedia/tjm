import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync('bibleandconflictoftheages/app.js', 'utf8');
function harness() {
  const storage = new Map();
  const context = vm.createContext({
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    window: { scrollY: 450, scrollTo: ({top}) => { context.window.scrollY = top; }, addEventListener() {} },
    document: { querySelectorAll: () => [], addEventListener() {} },
    requestAnimationFrame: fn => fn(), setTimeout, clearTimeout,
  });
  vm.runInContext(`let session = null, guestBrowsing = true;
    let currentIndex = 1, activeView = 'readings', activeBook = 'PP';
    const plan = {readings: [{id:'one',code:'PP'}, {id:'two',code:'PP'}], books:[{code:'PP'}]};
    const currentReading = () => plan.readings[currentIndex];
    const resolveReadingId = id => id;
    const render = () => {};
    ${source.slice(source.indexOf('  // Reading location'), source.indexOf('  function resolveReadingId'))}
    placeReady = true;`, context);
  return { run: code => vm.runInContext(code, context), storage, context };
}
test('guest reading, view and scroll position survive reopening', () => {
  const { run, context } = harness();
  run('savePlace(); currentIndex=0; activeView="journey"; placeReady=false;');
  context.window.scrollY = 0;
  run('restorePlace();');
  assert.equal(run('currentIndex'), 1);
  assert.equal(run('activeView'), 'readings');
  assert.equal(context.window.scrollY, 450);
});
test('locations are separate for guest and each signed-in member', () => {
  const { run } = harness();
  run('savePlace(); session={user:{id:"member-a"}};');
  assert.equal(run('readPlace()'), null);
  run('currentIndex=0; savePlace(); session={user:{id:"member-b"}};');
  assert.equal(run('readPlace()'), null);
  run('session=null; restorePlace();');
  assert.equal(run('currentIndex'), 1);
});
test('invalid data and blocked storage do not stop reading', () => {
  const { run, storage, context } = harness();
  storage.set('tjm-conflict-place-v1:guest', '{invalid');
  assert.doesNotThrow(() => run('restorePlace()'));
  storage.set('tjm-conflict-place-v1:guest', JSON.stringify({readingId:'removed', view:'bad', scrollY:-10}));
  assert.doesNotThrow(() => run('restorePlace()'));
  context.localStorage.setItem = () => { throw Error('blocked'); };
  assert.doesNotThrow(() => run('savePlace()'));
});
test('manifest launches only Bible and Conflict and has real sized icons', () => {
  const manifest = JSON.parse(readFileSync('bibleandconflictoftheages/manifest.webmanifest'));
  assert.equal(manifest.start_url, '/bibleandconflictoftheages/');
  assert.equal(manifest.scope, manifest.start_url);
  for (const icon of manifest.icons) {
    const png = readFileSync(icon.src.slice(1));
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
});
