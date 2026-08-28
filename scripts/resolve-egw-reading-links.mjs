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
    entries.push({
      paragraphId: Number(match[1]),
      title: match[2]
        .replace(/&mdash;/gi, "—")
        .replace(/&ndash;/gi, "–")
        .replace(/&rsquo;/gi, "’")
        .replace(/&ldquo;/gi, "“")
        .replace(/&rdquo;/gi, "”")
        .replace(/&amp;/gi, "&")
        .replace(/&#39;/gi, "’")
        .replace(/&[^;]+;/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    });
  }
  return entries;
}

const catalogCache = new Map();

async function chapterCatalog(code) {
  if (catalogCache.has(code)) return catalogCache.get(code);
  const bookId = bookIds[code];
  const rootUrl = `https://m.egwwritings.org/en/book/${bookId}/toc`;
  const rootHtml = await cachedFetch(rootUrl);
  const sectionIds = [...rootHtml.matchAll(new RegExp(`class=["'][^"']*ajaxtoc[^"']*["'][^>]*href=["']/en/book/${bookId}\\.(\\d+)`, "gi"))]
    .map((match) => Number(match[1]));
  const sectionHtml = await Promise.all(sectionIds.map((sectionId) => cachedFetch(`https://m.egwwritings.org/en/book/${bookId}.${sectionId}/toc`)));
  const entries = [rootHtml, ...sectionHtml]
    .flatMap((html) => tocEntries(html, bookId))
    .filter((entry) => /^(?:Chapter\s+\d+\b|Introduction\b)/i.test(entry.title));
  const unique = [...new Map(entries.map((entry) => [entry.paragraphId, entry])).values()]
    .map((entry) => ({ ...entry, chapterNumber: Number(entry.title.match(/^Chapter\s+(\d+)/i)?.[1]) || null }))
    .sort((left, right) => left.paragraphId - right.paragraphId);
  if (!unique.length) throw new Error(`No chapter catalog was found for ${code}.`);
  catalogCache.set(code, unique);
  return unique;
}

function explicitChapterNumbers(citation) {
  const numbers = [];
  for (const match of citation.matchAll(/\bCh(?:apter)?s?\s+(\d+(?:\s*(?:-|–|and|,)\s*\d+)*)/gi)) {
    const expression = match[1].replace(/\band\b/gi, ",");
    for (const part of expression.split(",").map((value) => value.trim()).filter(Boolean)) {
      const chapterRange = part.match(/^(\d+)\s*[-–]\s*(\d+)$/);
      if (chapterRange) {
        for (let chapter = Number(chapterRange[1]); chapter <= Number(chapterRange[2]); chapter += 1) numbers.push(chapter);
      } else if (/^\d+$/.test(part)) {
        numbers.push(Number(part));
      }
    }
  }
  return [...new Set(numbers)];
}

function pageBounds(reading) {
  const ranges = [...reading.commentaryCitation.matchAll(new RegExp(`\\b${reading.code}\\s*(\\d+)(?:\\.\\d+)?(?:\\s*[-–]\\s*(\\d+))?`, "gi"))]
    .map((match) => ({ start: Number(match[1]), end: Number(match[2] ?? match[1]) }));
  if (!ranges.length) return null;
  return { start: Math.min(...ranges.map((range) => range.start)), end: Math.max(...ranges.map((range) => range.end)) };
}

async function resolvePageParagraph(code, page, direction = 0) {
  const bookId = bookIds[code];
  for (let offset = 0; offset <= 6; offset += 1) {
    const candidatePage = page + (direction * offset);
    const query = `${code} ${candidatePage}`;
    const html = await cachedFetch(`https://m.egwwritings.org/en/search?query=${encodeURIComponent(query)}&suggestion=1`);
    const match = html.match(new RegExp(`href=["']/en/book/${bookId}\\.(\\d+)`, "i"));
    if (match) return Number(match[1]);
  }
  throw new Error(`No ${code} result was found near page ${page}.`);
}

function chapterTask(bookId, entry) {
  const label = entry.chapterNumber ? `Read Chapter ${entry.chapterNumber}` : "Read Introduction";
  return {
    label,
    chapterNumber: entry.chapterNumber,
    title: entry.title,
    paragraphId: entry.paragraphId,
    url: `https://egwwritings.org/read?panels=p${bookId}.${entry.paragraphId}&index=0`,
  };
}

async function resolveChapterTasks(reading, catalog, assignmentParagraphId) {
  const bookId = bookIds[reading.code];
  const explicit = explicitChapterNumbers(reading.commentaryCitation);
  if (explicit.length) {
    const selected = explicit.map((number) => catalog.find((entry) => entry.chapterNumber === number));
    if (selected.some((entry) => !entry)) throw new Error(`A listed chapter could not be found for ${reading.sourceKey}.`);
    return selected.map((entry) => chapterTask(bookId, entry));
  }
  if (/\bIntroduction\b/i.test(reading.commentaryCitation)) {
    const introduction = catalog.find((entry) => /^Introduction\b/i.test(entry.title));
    if (introduction) return [chapterTask(bookId, introduction)];
  }

  const bounds = pageBounds(reading);
  if (!bounds) throw new Error(`No chapter or page range was found for ${reading.sourceKey}.`);
  const startParagraphId = assignmentParagraphId ?? await resolvePageParagraph(reading.code, bounds.start, 1);
  const endParagraphId = bounds.end === bounds.start
    ? startParagraphId
    : await resolvePageParagraph(reading.code, bounds.end, -1);
  const selected = catalog.filter((entry, index) => {
    if (!entry.chapterNumber) return false;
    const nextParagraphId = catalog[index + 1]?.paragraphId ?? Number.POSITIVE_INFINITY;
    return entry.paragraphId <= endParagraphId && nextParagraphId > startParagraphId;
  });
  if (!selected.length) throw new Error(`No chapters intersected the supplied pages for ${reading.sourceKey}.`);
  return selected.map((entry) => chapterTask(bookId, entry));
}

async function resolveReading(reading) {
  const query = commentaryQuery(reading);
  const bookId = bookIds[reading.code];
  const catalog = await chapterCatalog(reading.code);
  const fallback = explicitChapterNumbers(reading.commentaryCitation)[0];
  const existing = existingLinks[reading.sourceKey];
  let paragraphId = existing?.query === query ? Number(existing.paragraphId) : null;
  if (!paragraphId) {
    const searchUrl = `https://m.egwwritings.org/en/search?query=${encodeURIComponent(query)}&suggestion=1`;
    const html = await cachedFetch(searchUrl);
    const match = html.match(new RegExp(`href=["']/en/book/${bookId}\\.(\\d+)`, "i"));
    paragraphId = match
      ? Number(match[1])
      : catalog.find((entry) => entry.chapterNumber === fallback || (/\bIntroduction\b/i.test(reading.commentaryCitation) && !entry.chapterNumber))?.paragraphId;
  }
  if (!paragraphId) throw new Error(`No ${reading.code} result was found for ${reading.sourceKey}: ${query}`);
  const chapters = await resolveChapterTasks(reading, catalog, paragraphId);
  return {
    query,
    bookId,
    paragraphId,
    url: chapters[0].url,
    chapters,
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
const existingLinks = JSON.parse(await readFile(LINK_MAP, "utf8"));
const assignments = plan.readings.filter((reading) => reading.commentaryCitation);
const resolved = await mapWithConcurrency(assignments, 3, resolveReading);
const linksBySourceKey = Object.fromEntries(assignments.map((reading, index) => [reading.sourceKey, resolved[index]]));

for (const reading of plan.readings) {
  reading.commentaryUrl = reading.commentaryCitation ? linksBySourceKey[reading.sourceKey].url : null;
  reading.commentaryTasks = reading.commentaryCitation ? linksBySourceKey[reading.sourceKey].chapters : [];
  if (reading.reviewNote?.includes("chapter links on egwwritings.org")) reading.reviewNote = null;
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

console.log(`Resolved ${resolved.length} assignments into chapter links on egwwritings.org.`);
