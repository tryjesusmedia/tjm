import { readFile, writeFile } from "node:fs/promises";

const WEBSITE_PLAN = new URL("../bibleandconflictoftheages/data/readings.json", import.meta.url);
const APP_PLAN = new URL("../../tryjesusjourney/data/conflictPlan.json", import.meta.url);
const LINK_MAP = new URL("./egw-reading-links.json", import.meta.url);

const bookIds = {
  PP: 84,
  PK: 88,
  DA: 130,
  AA: 127,
  GC: 132,
};

function commentaryQuery(reading) {
  return reading.commentaryPageStart
    ? `${reading.code} ${reading.commentaryPageStart}`
    : `${reading.commentaryBook} ${reading.commentaryCitation}`;
}

let nextRequestAt = 0;

async function fetchWithRetry(url, attempts = 10) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const waitForSlot = Math.max(0, nextRequestAt - Date.now());
      nextRequestAt = Math.max(Date.now(), nextRequestAt) + 350;
      if (waitForSlot) await new Promise((resolve) => setTimeout(resolve, waitForSlot));
      const response = await fetch(url, {
        headers: { "user-agent": "Try Jesus Media reading-plan link resolver" },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
  throw lastError;
}

const htmlCache = new Map();

function cachedFetch(url) {
  if (!htmlCache.has(url)) htmlCache.set(url, fetchWithRetry(url));
  return htmlCache.get(url);
}

function tocEntries(html, bookId) {
  const entries = [];
  const pattern = new RegExp(`href=["']/en/book/${bookId}\\.(\\d+)[^"']*["'][^>]*>([^<]+)</a>`, "gi");
  for (const match of html.matchAll(pattern)) {
    entries.push({ paragraphId: Number(match[1]), title: match[2].replace(/&[^;]+;/g, " ").replace(/\s+/g, " ").trim() });
  }
  return entries;
}

async function resolveFromToc(reading, bookId) {
  const rootUrl = `https://m.egwwritings.org/en/book/${bookId}/toc`;
  const rootHtml = await cachedFetch(rootUrl);
  const chapter = reading.commentaryCitation.match(/Chapter\s+(\d+)/i)?.[1];
  const matchesTarget = (entry) => chapter
    ? new RegExp(`^Chapter\\s+${chapter}\\D`, "i").test(entry.title)
    : /Introduction/i.test(reading.commentaryCitation) && /^Introduction\b/i.test(entry.title);

  const rootMatch = tocEntries(rootHtml, bookId).find(matchesTarget);
  if (rootMatch) return rootMatch.paragraphId;

  const sectionIds = [...rootHtml.matchAll(new RegExp(`class=["'][^"']*ajaxtoc[^"']*["'][^>]*href=["']/en/book/${bookId}\\.(\\d+)`, "gi"))]
    .map((match) => Number(match[1]));
  for (const sectionId of sectionIds) {
    const sectionHtml = await cachedFetch(`https://m.egwwritings.org/en/book/${bookId}.${sectionId}/toc`);
    const sectionMatch = tocEntries(sectionHtml, bookId).find(matchesTarget);
    if (sectionMatch) return sectionMatch.paragraphId;
  }
  return null;
}

async function resolveReading(reading) {
  const query = commentaryQuery(reading);
  const bookId = bookIds[reading.code];
  const searchUrl = `https://m.egwwritings.org/en/search?query=${encodeURIComponent(query)}&suggestion=1`;
  const html = await cachedFetch(searchUrl);
  const match = html.match(new RegExp(`href=["']/en/book/${bookId}\\.(\\d+)`, "i"));
  const paragraphId = match ? Number(match[1]) : await resolveFromToc(reading, bookId);
  if (!paragraphId) throw new Error(`No ${reading.code} result was found for ${reading.sourceKey}: ${query}`);
  return {
    query,
    bookId,
    paragraphId,
    url: `https://egwwritings.org/read?panels=p${bookId}.${paragraphId}&index=0`,
  };
}

async function mapWithConcurrency(items, concurrency, task) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

const plan = JSON.parse(await readFile(WEBSITE_PLAN, "utf8"));
const assignments = plan.readings.filter((reading) => reading.commentaryCitation);
const resolved = await mapWithConcurrency(assignments, 3, resolveReading);
const linksBySourceKey = Object.fromEntries(assignments.map((reading, index) => [reading.sourceKey, resolved[index]]));

for (const reading of plan.readings) {
  reading.commentaryUrl = reading.commentaryCitation ? linksBySourceKey[reading.sourceKey].url : null;
  if (reading.reviewNote?.includes("direct link on egwwritings.org")) reading.reviewNote = null;
}
plan.reviewQueue = plan.readings
  .filter((reading) => reading.reviewNote)
  .map(({ id, day, sourceKey, sourceEntry, reviewNote }) => ({ id, day, sourceKey, sourceEntry, reviewNote }));
plan.generatedAt = new Date().toISOString();

const serializedPlan = `${JSON.stringify(plan, null, 2)}\n`;
const serializedMap = `${JSON.stringify(linksBySourceKey, null, 2)}\n`;
await Promise.all([
  writeFile(WEBSITE_PLAN, serializedPlan, "utf8"),
  writeFile(APP_PLAN, serializedPlan, "utf8"),
  writeFile(LINK_MAP, serializedMap, "utf8"),
]);

console.log(`Resolved ${resolved.length} assignments to direct links on egwwritings.org.`);
