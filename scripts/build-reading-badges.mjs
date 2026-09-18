// Original vector illustrations. Regenerate the matching app module with
// node scripts/build-reading-badges.mjs /path/to/bibleandconflict
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plan = JSON.parse(await readFile(path.join(root, 'bibleandconflictoftheages/data/readings.json'), 'utf8'));
const rows = (await readFile(path.join(root, 'scripts/reading-badge-themes.tsv'), 'utf8')).trim().split('\n').map(line => line.split('|'));
if (rows.length !== plan.readings.length) throw new Error('Every reading needs a badge.');
const usedDesigns = new Set();
const catalog = plan.readings.map((r, i) => {
  const [day, motif, label] = rows[i];
  if (Number(day) !== r.day) throw new Error(`Badge order mismatch: ${r.id}`);
  const titles = r.commentaryTasks.map(task => task.title.replace(/^(?:Chapter \d+|Introduction)—/u, ''));
  const title = titles.length && titles.length <= 2 ? titles.join(' · ') : r.title;
  const style = Math.floor(i / 12) % 6;
  const detail = i % 4;
  let palette = (i * 7) % 12;
  while (usedDesigns.has(`${motif}:${palette}:${style}:${detail}`)) palette = (palette + 1) % 12;
  usedDesigns.add(`${motif}:${palette}:${style}:${detail}`);
  return { id: r.id, day: r.day, book: r.code, label, title, reference: r.bibleReference || r.commentaryCitation, motif, palette, style, detail };
});
const runtime = await readFile(path.join(root, 'scripts/reading-badge-art.cjs'), 'utf8');
const output = `/* Generated from scripts/reading-badge-themes.tsv and reading-badge-art.cjs. */\n${runtime.replace('/* CATALOG */ []', JSON.stringify(catalog))}`;
await writeFile(path.join(root, 'bibleandconflictoftheages/reading-badges.js'), output);
if (process.argv[2]) {
  const app = path.resolve(process.argv[2]);
  await mkdir(path.join(app, 'lib'), { recursive: true });
  await writeFile(path.join(app, 'lib/readingBadges.js'), output);
}
console.log(`Generated ${catalog.length} individually themed badges.`);
