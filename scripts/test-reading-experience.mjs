import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

for (const journey of ['chronbible', 'bibleandconflictoftheages']) {
  const html = await readFile(`${journey}/index.html`, 'utf8');
  const app = await readFile(`${journey}/app.js`, 'utf8');
  if (journey === 'bibleandconflictoftheages') {
    assert.match(html, /hero-intro-lead/, `${journey}: readable introduction`);
    assert.match(html, /<details class="hero-intro-more">/, `${journey}: introduction starts closed`);
  }
  assert.match(html, /reading-badges\.js/, `${journey}: badge artwork loaded`);
  assert.doesNotMatch(html + app, /principles-folders|TJMPrinciples|principleManager|tjm-open-principles-map|principles-text-size/);
}
assert(!(await readdir('lib')).some(name => /principles|reading-principle|mobile-map-fix/.test(name)), 'Retired map assets must not return');
console.log('Reading introductions, badge loading, and map retirement checks passed.');
