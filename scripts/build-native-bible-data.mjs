import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outputDirectory = join(root, "assets", "bible");
const kjvArchiveUrl = "https://ebible.org/Scriptures/eng-kjv2006_vpl.zip";
const webArchiveUrl = "https://ebible.org/Scriptures/engwebp_vpl.zip";

const bookCodes = {
  GEN: "Genesis", EXO: "Exodus", LEV: "Leviticus", NUM: "Numbers", DEU: "Deuteronomy",
  JOS: "Joshua", JDG: "Judges", RUT: "Ruth", "1SA": "1 Samuel", "2SA": "2 Samuel",
  "1KI": "1 Kings", "2KI": "2 Kings", "1CH": "1 Chronicles", "2CH": "2 Chronicles",
  EZR: "Ezra", NEH: "Nehemiah", EST: "Esther", JOB: "Job", PSA: "Psalms", PRO: "Proverbs",
  ECC: "Ecclesiastes", SOL: "Song of Solomon", ISA: "Isaiah", JER: "Jeremiah",
  LAM: "Lamentations", EZE: "Ezekiel", DAN: "Daniel", HOS: "Hosea", JOE: "Joel", AMO: "Amos",
  OBA: "Obadiah", JON: "Jonah", MIC: "Micah", NAH: "Nahum", HAB: "Habakkuk", ZEP: "Zephaniah",
  HAG: "Haggai", ZEC: "Zechariah", MAL: "Malachi", MAT: "Matthew", MAR: "Mark", LUK: "Luke",
  JOH: "John", ACT: "Acts", ROM: "Romans", "1CO": "1 Corinthians", "2CO": "2 Corinthians",
  GAL: "Galatians", EPH: "Ephesians", PHI: "Philippians", COL: "Colossians",
  "1TH": "1 Thessalonians", "2TH": "2 Thessalonians", "1TI": "1 Timothy", "2TI": "2 Timothy",
  TIT: "Titus", PHM: "Philemon", HEB: "Hebrews", JAM: "James", "1PE": "1 Peter",
  "2PE": "2 Peter", "1JO": "1 John", "2JO": "2 John", "3JO": "3 John", JUD: "Jude", REV: "Revelation",
};

function addVerse(chapters, chapterLabel, verse, text) {
  if (!chapters[chapterLabel]) chapters[chapterLabel] = [];
  chapters[chapterLabel].push({ verse: Number(verse), text });
}

function parseVpl(source) {
  const chapters = {};
  for (const line of source.split(/\r?\n/)) {
    // A handful of verses intentionally have no supplied text in this edition.
    // Keep their stable verse positions instead of silently dropping them.
    const match = line.match(/^([1-3A-Z]{3})\s+(\d+):(\d+)\s*(.*)$/u);
    if (!match) continue;
    const book = bookCodes[match[1]];
    if (!book) throw new Error(`Unknown WEB book code: ${match[1]}`);
    addVerse(chapters, `${book} ${match[2]}`, match[3], match[4]);
  }
  return chapters;
}

async function obtainVplSource({ environmentPath, archiveUrl, filename, temporaryPrefix }) {
  if (process.env[environmentPath]) return readFile(resolve(process.env[environmentPath]), "utf8");
  const temporaryDirectory = await mkdtemp(join(tmpdir(), temporaryPrefix));
  try {
    const archivePath = join(temporaryDirectory, `${filename}.zip`);
    const response = await fetch(archiveUrl);
    if (!response.ok) throw new Error(`${filename} download failed (${response.status}).`);
    await writeFile(archivePath, Buffer.from(await response.arrayBuffer()));
    const extractedDirectory = join(temporaryDirectory, "extracted");
    await mkdir(extractedDirectory);
    const result = spawnSync("tar", ["-xf", archivePath, "-C", extractedDirectory], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr || "Could not extract the WEB archive.");
    return readFile(join(extractedDirectory, filename), "utf8");
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function validate(label, chapters, expectedVerseCount, { allowBlank = false } = {}) {
  const chapterCount = Object.keys(chapters).length;
  const verseCount = Object.values(chapters).reduce((total, verses) => total + verses.length, 0);
  if (chapterCount !== 1189 || verseCount !== expectedVerseCount) {
    throw new Error(`${label} data validation failed (${chapterCount} chapters, ${verseCount} verses).`);
  }
  for (const [chapterLabel, verses] of Object.entries(chapters)) {
    verses.forEach((verse, index) => {
      if (verse.verse !== index + 1) throw new Error(`${label} has a verse-number gap at ${chapterLabel}:${index + 1}.`);
      if (!allowBlank && !verse.text) throw new Error(`${label} has blank text at ${chapterLabel}:${verse.verse}.`);
    });
  }
}

await mkdir(outputDirectory, { recursive: true });
const [kjvSource, webSource] = await Promise.all([
  obtainVplSource({
    environmentPath: "KJV_VPL_PATH",
    archiveUrl: kjvArchiveUrl,
    filename: "eng-kjv2006_vpl.txt",
    temporaryPrefix: "tjm-kjv-bible-",
  }),
  obtainVplSource({
    environmentPath: "WEB_VPL_PATH",
    archiveUrl: webArchiveUrl,
    filename: "engwebp_vpl.txt",
    temporaryPrefix: "tjm-web-bible-",
  }),
]);
const kjvChapters = parseVpl(kjvSource);
const webChapters = parseVpl(webSource);
validate("KJV", kjvChapters, 31102);
validate("WEB", webChapters, 31103, { allowBlank: true });

await writeFile(join(outputDirectory, "kjv.json"), JSON.stringify({
  meta: {
    id: "KJV",
    name: "King James Version",
    edition: "KJV 2006 standardized text",
    source: "eBible.org ENG-KJV2006",
    sourceUrl: "https://ebible.org/find/details.php?id=eng-kjv2006",
    rights: "Public domain",
  },
  chapters: kjvChapters,
}));

await writeFile(join(outputDirectory, "web.json"), JSON.stringify({
  meta: {
    id: "WEB",
    name: "World English Bible",
    edition: "Protestant 66-book edition",
    source: "eBible.org ENGWEBP",
    sourceUrl: "https://ebible.org/find/details.php?id=engwebp",
    rights: "Public domain; World English Bible is a trademark of eBible.org",
  },
  chapters: webChapters,
}));

console.log(`Built KJV (${Object.keys(kjvChapters).length} chapters) and WEB (${Object.keys(webChapters).length} chapters).`);
