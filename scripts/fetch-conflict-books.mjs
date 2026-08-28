import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const outputDirectory = fileURLToPath(new URL("../knowledge/sources/conflict-of-the-ages/", import.meta.url));
const refresh = process.argv.includes("--refresh");

const books = [
  { code: "PP", filename: "01-patriarchs-and-prophets.pdf", title: "Patriarchs and Prophets", year: 1890, url: "https://media2.egwwritings.org/pdf/en_PP.pdf" },
  { code: "PK", filename: "02-prophets-and-kings.pdf", title: "Prophets and Kings", year: 1917, url: "https://media2.egwwritings.org/pdf/en_PK.pdf" },
  { code: "DA", filename: "03-the-desire-of-ages.pdf", title: "The Desire of Ages", year: 1898, url: "https://media2.egwwritings.org/pdf/en_DA.pdf" },
  { code: "AA", filename: "04-the-acts-of-the-apostles.pdf", title: "The Acts of the Apostles", year: 1911, url: "https://media2.egwwritings.org/pdf/en_AA.pdf" },
  { code: "GC", filename: "05-the-great-controversy.pdf", title: "The Great Controversy", year: 1911, url: "https://media2.egwwritings.org/pdf/en_GC.pdf" },
];

async function validExisting(file) {
  try {
    const data = await readFile(file);
    return data.length > 500_000 && data.subarray(0, 5).toString("ascii") === "%PDF-";
  } catch {
    return false;
  }
}

await mkdir(outputDirectory, { recursive: true });
const sourceRecords = [];

for (const book of books) {
  const destination = path.join(outputDirectory, book.filename);
  if (!refresh && await validExisting(destination)) {
    const data = await readFile(destination);
    sourceRecords.push({ ...book, bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") });
    console.log(`Verified ${book.code}: ${book.filename}`);
    continue;
  }

  const response = await fetch(book.url, { headers: { "user-agent": "TryJesusMediaKnowledgeSync/1.0" } });
  if (!response.ok) throw new Error(`${book.code} download failed with ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length < 500_000 || data.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error(`${book.code} did not return a valid full-book PDF`);
  }
  await writeFile(destination, data);
  sourceRecords.push({ ...book, bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") });
  console.log(`Downloaded ${book.code}: ${book.filename}`);
}

await writeFile(
  path.join(outputDirectory, "source-map.json"),
  `${JSON.stringify({
    collection: "Conflict of the Ages",
    retrievalRole: "Supplemental, hidden context. Scripture remains primary.",
    downloadedAt: new Date().toISOString(),
    books: sourceRecords,
  }, null, 2)}\n`,
  "utf8",
);

console.log(`Prepared ${sourceRecords.length} official EGW Writings books for Pastor Kal retrieval.`);
