import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLAN_ID = "bible-conflict-ages-v1";
const OUTPUT = new URL("../bibleandconflictoftheages/data/readings.json", import.meta.url);
const APP_OUTPUT = new URL("../../tryjesusjourney/data/conflictPlan.json", import.meta.url);

const bookMeta = {
  PP: { title: "Patriarchs and Prophets", shortTitle: "Patriarchs & Prophets", accent: "#dca449" },
  PK: { title: "Prophets and Kings", shortTitle: "Prophets & Kings", accent: "#bd7f50" },
  DA: { title: "The Desire of Ages", shortTitle: "Desire of Ages", accent: "#d9b85b" },
  AA: { title: "The Acts of the Apostles", shortTitle: "Acts of the Apostles", accent: "#a68b63" },
  GC: { title: "The Great Controversy", shortTitle: "Great Controversy", accent: "#8f6b94" },
};

const reviewNotes = new Map([
  ["PP:5", "The supplied commentary notation ends with “-86.3” after PP 80-89; preserved for owner review."],
  ["PP:6", "The supplied commentary notation combines “96.3” with PP 90-110; preserved for owner review."],
  ["PP:7", "The supplied commentary notation reads “PP 111-116- 112.1”; preserved for owner review."],
  ["PP:26", "The supplied Scripture reference reads “Ex 42-34.” Exodus has no chapter 42, so no Bible link is generated until this is confirmed."],
  ["PK:8", "The supplied Scripture reference reads “Eze 32: 33,” which may be a chapter/verse typo; preserved for owner review."],
  ["PK:30", "The supplied book name is “Zephenaih”; preserved in the source record and normalized only for the outbound Bible link."],
  ["PK:62", "Several Psalm ranges use colons where separators may have been intended; preserved for owner review."],
  ["DA:32", "The supplied reference ends “Luke 8:40-56,” with a trailing comma; preserved for owner review."],
  ["DA:39", "The supplied reference reads “Matthew 15-21-28”; no Bible link is generated until the intended punctuation is confirmed."],
  ["DA:40", "The supplied reference reads “Mt 15:29-39; 16-1-12”; no Bible link is generated until the intended punctuation is confirmed."],
  ["DA:43", "The supplied reference ends with the incomplete fragment “Mark”; no Bible link is generated until the intended Mark passage is confirmed."],
  ["DA:51", "The supplied Luke range “Luke 11:1-18:14, 24-30, 35-43” is ambiguous; no Bible link is generated until confirmed."],
  ["DA:77", "The supplied entry interleaves DA 788-794 with the Mark and Luke references; the pairing is preserved and flagged for owner review."],
]);

function blocks(text) {
  return text
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
}

function bibleLine(line) {
  return /^(?:(?:[123]\s*(?:and\s*[23]\s*)?)?(?:Gen|Ex|Lev|Num|Dt|Deut|Josh|Judges|Ruth|Sa|Chron|Ki|Kings|Chronicles|Ps|Psalm|Proverbs|Ecclesiastes|Song|Is|Isaiah|Jer|Jeremiah|Lam|Lamentations|Eze|Ezekiel|Dan|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zeph|Zephenaih|Haggai|Zech|Zechariah|Malachi|Mt|Matthew|Mk|Mark|Lk|Luke|Jn|John|Acts|Romans|Corinthians|Galatians|Ephesians|Philippians|Colossians|Thessalonians|Timothy|Titus|Philemon|Hebrews|James|Peter|Jude|Revelation)\b|[123]\s*,\s*[23]\s*,\s*[3]?\s*John\b|[12]\s+and\s+2\s+(?:Thessalonians|Timothy)\b)/i.test(line);
}

function extractPages(code, citation) {
  const match = citation.match(new RegExp(`\\b${code}\\s+(\\d+)(?:[.-]\\d+)?(?:\\s*[-–]\\s*(\\d+))?`, "i"));
  if (!match) return { start: null, end: null };
  return { start: Number(match[1]), end: Number(match[2] ?? match[1]) };
}

function normalizeBibleQuery(value) {
  return value
    .replace(/\b1 and 2 Thessalonians\b/gi, "1 Thessalonians; 2 Thessalonians")
    .replace(/\b1 and 2 Timothy\b/gi, "1 Timothy; 2 Timothy")
    .replace(/\b1, 2, 3 John\b/gi, "1 John; 2 John; 3 John")
    .replace(/\bTitus, 2 Corinthians\b/gi, "Titus; 2 Corinthians")
    .replace(/\bZephenaih\b/gi, "Zephaniah")
    .replace(/\b(\d)\s+Sa\b/gi, "$1 Samuel")
    .replace(/\b(\d)\s+Ki\b/gi, "$1 Kings")
    .replace(/\b(\d)\s+Chron\b/gi, "$1 Chronicles")
    .replace(/\bDt\b/gi, "Deuteronomy")
    .replace(/\bEze\b/gi, "Ezekiel")
    .replace(/\bIs\b/gi, "Isaiah")
    .replace(/\bJer\b/gi, "Jeremiah")
    .replace(/\bLam\b/gi, "Lamentations")
    .replace(/\bPs\b/gi, "Psalms")
    .replace(/\bMt\b/gi, "Matthew")
    .replace(/\bMk\b/gi, "Mark")
    .replace(/\bLk\b/gi, "Luke")
    .replace(/\bJn\b/gi, "John")
    .replace(/\s*;\s*/g, "; ")
    .replace(/\s+/g, " ")
    .trim();
}

function chapterTitle(citation, fallback, heading = "") {
  if (heading) return heading;
  const compactChapter = citation.match(/^(?:Ch|Chapter)\s+([\d]+(?:\s*(?:-|and|,)\s*\d+)*)\s*(?:\(|$)/i);
  if (compactChapter?.[1]) {
    const value = compactChapter[1].trim();
    return /[-,]|\band\b/i.test(value) ? `Chapters ${value}` : `Chapter ${value}`;
  }
  const emDash = citation.match(/(?:Chapter|Ch)\s*\d+(?:\s*(?:and|,|-)\s*\d+)?\s*[.—-]\s*([^,(]+)/i);
  if (emDash?.[1]) return emDash[1].replace(/\s+(?:PP|PK|DA|AA|GC)\s+\d.*$/i, "").replace(/[.”“"]+$/g, "").trim();
  const numberedTitle = citation.match(/^\d+\.\s*([^()]+)/);
  if (numberedTitle?.[1]) return numberedTitle[1].replace(/[.”“"]+$/g, "").trim();
  const trailingTitle = citation.match(/(?:PP|PK|DA|AA|GC)\s+\d+\s*[-–]\s*\d+\.\s*\d+\s+(.+)$/i);
  if (trailingTitle?.[1]) return trailingTitle[1].trim();
  const paren = citation.match(/\((?:Ch|Chapter)\s*([^)]+)\)/i);
  if (paren?.[1]) return `Chapter ${paren[1].trim()}`;
  const trailingChapter = citation.match(/(?:PP|PK|DA|AA|GC)\s+\d+\s*[-–]\s*\d+\s+(?:ch(?:apter)?\s*)?(\d+(?:\s*,\s*\d+)*)\s*$/i);
  if (trailingChapter?.[1]) return `Chapter ${trailingChapter[1].trim()}`;
  const chapter = citation.match(/\b(?:Chapter|Ch)\s+([\d, -]+(?:and\s+\d+)?)/i);
  if (chapter?.[1]) return `Chapter ${chapter[1].trim()}`;
  return fallback;
}

function createRaw(code, sourceBlock, sourceLines, bibleLines, commentaryLines, heading = "") {
  const meta = bookMeta[code];
  const sourceKey = `${code}:${sourceBlock}`;
  let bibleReference = bibleLines.join("; ").replace(/;\s*;/g, ";").trim();
  if (sourceKey === "PK:15") bibleReference = bibleReference.replace(/; 2; Chronicles/i, "; 2 Chronicles");
  if (sourceKey === "DA:77") bibleReference = "Matthew 28:1, 5-8; John 20:1-18; Mark 16:1-14; Luke 24:1-12";
  const commentaryCitation = commentaryLines.join(" · ").trim();
  const pages = extractPages(code, commentaryCitation);
  const reviewNote = reviewNotes.get(sourceKey) ?? null;
  const malformedBible = ["PP:26", "DA:39", "DA:40", "DA:43", "DA:51"].includes(sourceKey);
  const bibleQuery = bibleReference ? normalizeBibleQuery(bibleReference) : "";
  const commentaryQuery = pages.start ? `${code} ${pages.start}` : `${meta.title} ${commentaryCitation}`;
  const fallbackTitle = bibleReference || `${meta.shortTitle} reading`;
  return {
    code,
    sourceBlock,
    sourceKey,
    sourceEntry: sourceLines.join("\n"),
    heading: heading || "",
    title: chapterTitle(commentaryCitation, fallbackTitle, heading),
    bibleReference,
    bibleQuery,
    bibleUrl: bibleQuery && !malformedBible
      ? `https://www.biblegateway.com/passage/?search=${encodeURIComponent(bibleQuery)}&version=KJV`
      : null,
    commentaryBook: meta.title,
    commentaryCode: code,
    commentaryCitation,
    commentaryPageStart: pages.start,
    commentaryPageEnd: pages.end,
    commentaryUrl: `https://m.egwwritings.org/en/search?query=${encodeURIComponent(commentaryQuery)}&suggestion=1`,
    reviewNote,
  };
}

function parsePP(text) {
  return blocks(text).slice(1).map((lines, index) => {
    const split = lines.findIndex((line) => /^(?:Ch|Chapter)\s+\d+/i.test(line));
    return createRaw("PP", index + 1, lines, split < 0 ? lines : lines.slice(0, split), split < 0 ? [] : lines.slice(split));
  });
}

function parsePK(text) {
  const source = blocks(text);
  const result = [createRaw("PK", 0, source[0], [], source[0].slice(1), "The Vineyard of the Lord")];

  for (let index = 1; index <= 36; index += 1) {
    const lines = source[index];
    const split = lines.findIndex((line) => /^(?:PK\s+\d|Chapter\s+\d|The Healing of the Waters)/i.test(line));
    result.push(createRaw("PK", index, lines, lines.slice(0, split), lines.slice(split)));
  }

  const delayedTitles = source.slice(57, 60).flat().filter((line) => /^Chapter\s+\d+/i.test(line));
  for (let index = 37; index <= 56; index += 1) {
    const lines = source[index];
    const title = delayedTitles[index - 37] ?? "";
    result.push(createRaw("PK", index, [...lines, title], lines.slice(0, -1), [lines.at(-1), title]));
  }

  for (let index = 60; index <= 61; index += 1) {
    const lines = source[index];
    const title = delayedTitles[index - 40] ?? "";
    result.push(createRaw("PK", index, [...lines, title], lines.slice(0, -1), [lines.at(-1), title]));
  }

  result.push(createRaw("PK", 62, source[62], source[62], [], "Old Testament closing readings"));
  return result;
}

function parseDA(text) {
  return blocks(text).slice(1).map((lines, offset) => {
    const sourceBlock = offset + 1;
    let heading = "";
    const working = [...lines];
    if (working[0] && !bibleLine(working[0]) && !/^(?:Ch|Chapter|DA\b|\d+\.)/i.test(working[0])) heading = working.shift();

    let split = working.findIndex((line) => /^(?:Ch|Chapter|DA\b|\d+\.\s)/i.test(line));
    let bible = split < 0 ? [...working] : working.slice(0, split);
    let commentary = split < 0 ? [] : working.slice(split);

    if (split < 0) {
      const inlineIndex = working.findIndex((line) => /(?:;|\s)DA\s+\d/i.test(line));
      if (inlineIndex >= 0) {
        const line = working[inlineIndex];
        const marker = line.search(/(?:;|\s)DA\s+\d/i);
        bible = [...working.slice(0, inlineIndex), line.slice(0, marker).replace(/;\s*$/, "").trim()];
        commentary = [line.slice(marker).replace(/^;\s*/, "").trim(), ...working.slice(inlineIndex + 1)];
      }
    }

    if (sourceBlock === 77) {
      bible = ["Matthew 28:1, 5-8", "John 20:1-18", "Mark 16:1-14", "Luke 24:1-12"];
      commentary = ["DA 788-794 82"];
    }
    return createRaw("DA", sourceBlock, lines, bible.filter(Boolean), commentary.filter(Boolean), heading);
  });
}

function parseAA(text) {
  return blocks(text).slice(1).map((lines, offset) => {
    const sourceBlock = offset + 1;
    const split = lines.findIndex((line) => /^(?:Ch\s+\d|\d+\s+AA\b|AA\s+\d)/i.test(line));
    return createRaw("AA", sourceBlock, lines, split < 0 ? lines : lines.slice(0, split), split < 0 ? [] : lines.slice(split));
  });
}

function parseGC(text) {
  return blocks(text).slice(1).map((lines, offset) => {
    const sourceBlock = offset + 1;
    const split = lines.findIndex((line) => /^GC\s+\d/i.test(line));
    return createRaw("GC", sourceBlock, lines, split < 0 ? lines : lines.slice(0, split), split < 0 ? [] : lines.slice(split));
  });
}

function argsByCode() {
  const args = Object.fromEntries(process.argv.slice(2).map((value) => {
    const split = value.indexOf("=");
    return [value.slice(0, split).toUpperCase(), value.slice(split + 1)];
  }));
  for (const code of Object.keys(bookMeta)) {
    if (!args[code]) throw new Error(`Missing ${code}=<source text path>`);
  }
  return args;
}

const input = argsByCode();
const sourceTexts = Object.fromEntries(await Promise.all(Object.entries(input).map(async ([code, file]) => [code, await readFile(file, "utf8")])));
const rawReadings = [
  ...parsePP(sourceTexts.PP),
  ...parsePK(sourceTexts.PK),
  ...parseDA(sourceTexts.DA),
  ...parseAA(sourceTexts.AA),
  ...parseGC(sourceTexts.GC),
];

const readings = rawReadings.map((reading, index) => ({
  id: `coa-${String(index + 1).padStart(3, "0")}`,
  day: index + 1,
  ...reading,
}));

const payload = {
  schemaVersion: 1,
  planId: PLAN_ID,
  title: "The Bible & Conflict of the Ages Journey",
  subtitle: "Read Scripture. Follow the story. Discover the principles.",
  sourcePolicy: "Pairings, order, and source wording are preserved from the five supplied plans. Ambiguities are flagged rather than silently corrected.",
  generatedAt: new Date().toISOString(),
  sourceHashes: Object.fromEntries(Object.entries(sourceTexts).map(([code, text]) => [code, createHash("sha256").update(text).digest("hex")])),
  books: Object.entries(bookMeta).map(([code, meta]) => ({
    code,
    ...meta,
    readingCount: readings.filter((reading) => reading.code === code).length,
  })),
  reviewQueue: readings.filter((reading) => reading.reviewNote).map(({ id, day, sourceKey, sourceEntry, reviewNote }) => ({ id, day, sourceKey, sourceEntry, reviewNote })),
  readings,
};

const serialized = `${JSON.stringify(payload, null, 2)}\n`;
for (const destination of [OUTPUT, APP_OUTPUT]) {
  const destinationPath = fileURLToPath(destination);
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await writeFile(destinationPath, serialized, "utf8");
}

console.log(`Imported ${readings.length} readings (${payload.reviewQueue.length} review flags) into website and app data bundles.`);
