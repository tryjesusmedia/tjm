import fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";

const base = (process.env.SITE_BASE_URL || "https://tryjesusmedia.com").replace(/\/$/, "");
const outputDir = path.resolve("knowledge/sources/lessons");

const guides = [
  ...Array.from({ length: 10 }, (_, i) => ({
    track: "get-to-know-jesus",
    number: i + 1,
    url: `${base}/get-to-know-jesus/guide${i + 1}/`,
  })),
  ...Array.from({ length: 9 }, (_, i) => ({
    track: "bible-prophecy",
    number: i + 1,
    url: `${base}/bible-prophecy/guide${i + 1}/`,
  })),
];

function cleanText(html, url) {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, nav, footer, form").remove();
  const title = $("h1").first().text().trim() || $("title").text().trim() || url;
  const main = $("main").length ? $("main") : $("body");
  const text = main.text()
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return `# ${title}\n\nSource URL: ${url}\n\n${text}\n`;
}

await fs.mkdir(outputDir, { recursive: true });

for (const guide of guides) {
  process.stdout.write(`Fetching ${guide.url} ... `);
  const res = await fetch(guide.url, { headers: { "user-agent": "TryJesusMedia-PastorKal-KB/1.0" } });
  if (!res.ok) {
    console.log(`FAILED (${res.status})`);
    continue;
  }
  const html = await res.text();
  const text = cleanText(html, guide.url);
  const filename = `${guide.track}-guide${String(guide.number).padStart(2, "0")}.txt`;
  await fs.writeFile(path.join(outputDir, filename), text, "utf8");
  console.log(`saved ${filename}`);
}

console.log("Guide sync complete.");
