import assert from "node:assert/strict";
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = normalize(pathname.replace(/^\/+/, ""));
    if (relative.startsWith("..")) throw new Error("Invalid path");
    let file = join(root, relative || "scripts/readable-intro-principles-smoke.html");
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    response.writeHead(200, {
      "content-type": contentTypes[extname(file)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(await readFile(file));
  } catch (_error) {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("Not found");
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

try {
  const url = `http://127.0.0.1:${address.port}/scripts/readable-intro-principles-smoke.html`;
  await page.goto(url, { waitUntil: "domcontentloaded" });

  const details = page.locator(".hero-intro-more");
  assert.equal(await details.getAttribute("open"), null, "The longer introduction should begin closed.");
  const leadSize = Number.parseFloat(await page.locator(".hero-intro-lead").evaluate((element) => getComputedStyle(element).fontSize));
  assert.ok(leadSize >= 18, `The introduction lead should be comfortably readable; got ${leadSize}px.`);
  await details.locator("summary").click();
  assert.equal(await details.getAttribute("open"), "", "The introduction should expand from its summary.");
  await details.locator(".hero-intro-more-content").waitFor({ state: "visible" });

  const controls = page.locator(".tjm-fm-text-controls");
  await controls.waitFor({ state: "visible" });
  assert.equal(await controls.locator("button").count(), 3);
  assert.equal(await controls.locator('[data-principles-text-size="default"]').getAttribute("aria-pressed"), "true");

  const principleBody = page.locator(".tjm-fm-principle-body > p");
  const defaultSize = Number.parseFloat(await principleBody.evaluate((element) => getComputedStyle(element).fontSize));
  assert.ok(defaultSize >= 18, `Default principle text should be at least 18px; got ${defaultSize}px.`);

  await controls.locator('[data-principles-text-size="large"]').click();
  assert.equal(await page.locator("html").getAttribute("data-principles-text-size"), "large");
  assert.equal(await controls.locator('[data-principles-text-size="large"]').getAttribute("aria-pressed"), "true");
  const largeSize = Number.parseFloat(await principleBody.evaluate((element) => getComputedStyle(element).fontSize));
  assert.ok(largeSize > defaultSize, `Large text (${largeSize}px) should exceed default text (${defaultSize}px).`);
  assert.equal(await page.evaluate(() => localStorage.getItem("tjm-principles-text-size")), "large");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".tjm-fm-text-controls").waitFor({ state: "visible" });
  assert.equal(await page.locator("html").getAttribute("data-principles-text-size"), "large");
  assert.equal(await page.locator('[data-principles-text-size="large"]').getAttribute("aria-pressed"), "true");

  assert.deepEqual(errors, [], `Browser errors:\n${errors.join("\n")}`);
  console.log("Readable introduction and Principles text-size browser test passed.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
