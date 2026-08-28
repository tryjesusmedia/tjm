import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLAN_ID = "bible-conflict-ages-v1";
const OUTPUT = new URL("../bibleandconflictoftheages/data/readings.json", import.meta.url);
const APP_OUTPUT = new URL("../../tryjesusjourney/data/conflictPlan.json", import.meta.url);
const egwReadingLinks = JSON.parse(await readFile(new URL("./egw-reading-links.json", import.meta.url), "utf8"));
const EGW_LINK_REVIEW_NOTE = "Resolve and verify this assignment's direct link on egwwritings.org before publishing.";

const bookMeta = {
  PP: { title: "Patriarchs and Prophets", shortTitle: "Patriarchs & Prophets", accent: "#dca449" },
  PK: { title: "Prophets and Kings", shortTitle: "Prophets & Kings", accent: "#bd7f50" },
  DA: { title: "The Desire of Ages", shortTitle: "Desire of Ages", accent: "#d9b85b" },
  AA: { title: "The Acts of the Apostles", shortTitle: "Acts of the Apostles", accent: "#a68b63" },
  GC: { title: "The Great Controversy", shortTitle: "Great Controversy", accent: "#8f6b94" },
};

// Owner-approved corrections from Corrections.txt. The original supplied block is
// retained separately on every corrected reading for auditability.
const approvedCorrections = new Map([
  ["PP:5", { bibleLines: ["Gen 4:17-26; 5"], commentaryLines: ["Chapter 6—Seth and Enoch, PP 80-89"] }],
  ["PP:6", { bibleLines: ["Gen 6; 7"], commentaryLines: ["Chapter 7—The Flood", "Chapter 8—After the Flood, PP 90-110"] }],
  ["PP:7", { bibleLines: ["Gen 8-10"], commentaryLines: ["Chapter 9—The Literal Week, PP 111-116"] }],
  ["PP:26", { bibleLines: ["Ex 32-34"], commentaryLines: ["Chapter 28—Idolatry at Sinai, PP 315-330"] }],
  ["PK:8", { bibleLines: ["1 Kings 17:1-7", "Ezekiel 32; 33"], commentaryLines: ["Chapter 9—Elijah the Tishbite"] }],
  ["PK:17", { bibleLines: ["Song of Solomon 1-5; 7; 8"], commentaryLines: ["PK 229-234", "Chapter 18—The Healing of the Waters"] }],
  ["PK:30", { bibleLines: ["2 Kings 21", "2 Chronicles 33", "Habakkuk", "Zephaniah"], commentaryLines: ["Chapter 32—Manasseh and Josiah (PK 381-391)"] }],
  ["PK:62", { bibleLines: ["Ezekiel 34-48; Obadiah; Zechariah 11; 12; 14", "Psalm 1-8; 10-21; 23-45; 47; 49-67; 70; 73-75; 77; 79; 81; 84-86; 89; 90; 92-101; 103; 106; 108-111; 113-125; 127-145; 147-150"], commentaryLines: [] }],
  ["DA:8", { bibleLines: ["Matthew 3:13-17; Mark 1:9-11; Luke 3:21-22"], commentaryLines: ["Chapter 11—The Baptism, DA 109-113"] }],
  ["DA:32", { bibleLines: ["Matthew 9:18-31", "Mark 5:21-43", "Luke 8:40-56"], commentaryLines: ["Chapter 36—The Touch of Faith, DA 342-348"] }],
  ["DA:39", { bibleLines: ["Matthew 15:21-28", "Mark 7:24-30"], commentaryLines: ["Chapter 43—The Gentile Woman, DA 399-403"] }],
  ["DA:40", { bibleLines: ["Matthew 15:29-39; 16:1-12", "Mark 7:31-37; 8:1-21"], commentaryLines: ["Chapter 44—The Pharisees' Leaven, DA 404-409"] }],
  ["DA:43", { bibleLines: ["Matthew 17:9-21", "Mark 9:9-29"], commentaryLines: ["Chapter 47—Ministry, DA 426-431"] }],
  ["DA:45", { bibleLines: ["John 7:1-15; 37-39"], commentaryLines: ["Chapter 49—At the Feast of Tabernacles, DA 447-454"] }],
  ["DA:49", { bibleLines: ["Matthew 19:1-12", "Luke 9:51-56", "Mark 10:1-12", "Matthew 19:23-30", "Mark 10:23-31", "Luke 10:1-24", "Matthew 20:1-19, 29-34", "Mark 10:46-52"], commentaryLines: ["Chapter 53—The Last Journey From Galilee, DA 485-496"] }],
  ["DA:51", { bibleLines: ["Luke 11:1-18:14; 18:24-30; 18:35-43; 19:11-28"], commentaryLines: ["Chapter 55—Not With Outward Show, DA 506-510"] }],
  ["DA:77", { bibleLines: ["Matthew 28:1, 5-8", "John 20:1-18", "Mark 16:1-14", "Luke 24:1-12"], commentaryLines: ["Chapter 82—“Why Weepest Thou?”, DA 788-794"] }],
  ["AA:1", { bibleLines: [], commentaryLines: ["Chapter 1—God's Purpose for His Church, AA 9-20"] }],
  ["AA:3", { bibleLines: ["Acts 1:9-26"], commentaryLines: ["Chapters 3 and 4, AA 30-34"] }],
  ["AA:4", { bibleLines: ["Acts 2:1-39"], commentaryLines: ["Chapter 5—The Gift of the Spirit, AA 35-56"] }],
]);

const ppChapterPages = new Map(Object.entries({
  39: "433-437", 40: "438-452", 41: "453-461", 42: "462-468", 43: "469-480",
  44: "481-486", 45: "487-498", 46: "499-504", 47: "505-509", 48: "510-520",
  49: "521-524", 50: "525-529", 51: "530-536", 52: "537-542", 53: "543-559",
  54: "560-568", 55: "569-574", 56: "575-580", 57: "581-591", 58: "592-602",
  59: "603-615", 60: "616-626", 61: "627-636", 62: "637-642", 63: "643-648",
  64: "649-659", 65: "660-674", 66: "675-682", 67: "683-689", 68: "690-696",
  69: "697-701", 70: "703-716", 71: "717-726", 72: "727-745", 73: "746-755",
}).map(([chapter, pages]) => [Number(chapter), pages]));

function addPpPageRange(line) {
  const chapter = Number(line.match(/^(?:Ch|Chapter)\s+(\d+)/i)?.[1]);
  const pages = ppChapterPages.get(chapter);
  return pages && !/\bPP\s+\d/i.test(line) ? `${line}, PP ${pages}` : line;
}

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
  const correction = approvedCorrections.get(sourceKey);
  const originalSourceEntry = sourceLines.join("\n");
  const correctedBibleLines = correction?.bibleLines ?? bibleLines;
  let correctedCommentaryLines = correction?.commentaryLines ?? commentaryLines;
  if (code === "PP") correctedCommentaryLines = correctedCommentaryLines.map(addPpPageRange);
  const correctedHeading = correction?.heading ?? heading;
  const correctedSourceLines = correction
    ? [...correctedBibleLines, ...correctedCommentaryLines]
    : code === "PP" && correctedCommentaryLines.some((line, index) => line !== commentaryLines[index])
      ? [...bibleLines, ...correctedCommentaryLines]
      : sourceLines;
  let bibleReference = correctedBibleLines.join("; ").replace(/;\s*;/g, ";").trim();
  if (sourceKey === "PK:15") bibleReference = bibleReference.replace(/; 2; Chronicles/i, "; 2 Chronicles");
  const commentaryCitation = correctedCommentaryLines.join(" · ").trim();
  const pages = extractPages(code, commentaryCitation);
  const bibleQuery = bibleReference ? normalizeBibleQuery(bibleReference) : "";
  const commentaryQuery = pages.start ? `${code} ${pages.start}` : `${meta.title} ${commentaryCitation}`;
  const mappedEgwLink = commentaryCitation ? egwReadingLinks[sourceKey] : null;
  const egwLink = mappedEgwLink?.query === commentaryQuery ? mappedEgwLink : null;
  const fallbackTitle = bibleReference || `${meta.shortTitle} reading`;
  return {
    code,
    sourceBlock,
    sourceKey,
    sourceEntry: correctedSourceLines.join("\n"),
    originalSourceEntry: originalSourceEntry === correctedSourceLines.join("\n") ? null : originalSourceEntry,
    correctionApplied: Boolean(correction),
    heading: correctedHeading || "",
    title: chapterTitle(commentaryCitation, fallbackTitle, correctedHeading),
    bibleReference,
    bibleQuery,
    bibleUrl: bibleQuery
      ? `https://www.biblegateway.com/passage/?search=${encodeURIComponent(bibleQuery)}&version=KJV`
      : null,
    commentaryBook: meta.title,
    commentaryCode: code,
    commentaryCitation,
    commentaryPageStart: pages.start,
    commentaryPageEnd: pages.end,
    commentaryUrl: commentaryCitation ? (egwLink?.url ?? "https://egwwritings.org/") : null,
    reviewNote: commentaryCitation && !egwLink ? EGW_LINK_REVIEW_NOTE : null,
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
  sourcePolicy: "Pairings and order follow the five supplied plans. Owner-approved corrections are applied while each changed source block is retained in originalSourceEntry for auditability; any future ambiguity must be flagged rather than silently corrected.",
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
