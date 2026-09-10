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
  const decrease = controls.locator('[data-principles-text-action="decrease"]');
  const reset = controls.locator('[data-principles-text-action="reset"]');
  const increase = controls.locator('[data-principles-text-action="increase"]');
  const status = controls.locator("[data-principles-text-status]");
  assert.equal(await page.locator("html").getAttribute("data-principles-text-step"), "6");
  assert.equal((await status.textContent()).trim(), "7 of 20");
  assert.equal(await reset.getAttribute("aria-pressed"), "true");
  assert.equal(await decrease.isDisabled(), false);
  assert.equal(await increase.isDisabled(), false);

  const principleBody = page.locator(".tjm-fm-principle-body > p");
  const defaultSize = Number.parseFloat(await principleBody.evaluate((element) => getComputedStyle(element).fontSize));
  assert.ok(defaultSize >= 18, `Default principle text should be at least 18px; got ${defaultSize}px.`);

  let previousSize = defaultSize;
  for (let expectedStep = 7; expectedStep <= 9; expectedStep += 1) {
    await increase.click();
    assert.equal(await page.locator("html").getAttribute("data-principles-text-step"), String(expectedStep));
    const nextSize = Number.parseFloat(await principleBody.evaluate((element) => getComputedStyle(element).fontSize));
    assert.ok(nextSize > previousSize, `Tap ${expectedStep - 6} should increase text from ${previousSize}px; got ${nextSize}px.`);
    previousSize = nextSize;
  }
  assert.equal((await status.textContent()).trim(), "10 of 20");
  assert.equal(await reset.getAttribute("aria-pressed"), "false");
  assert.equal(await page.evaluate(() => localStorage.getItem("tjm-principles-text-size")), "9");

  await page.reload({ waitUntil: "domcontentloaded" });
  const reloadedControls = page.locator(".tjm-fm-text-controls");
  await reloadedControls.waitFor({ state: "visible" });
  const reloadedDecrease = reloadedControls.locator('[data-principles-text-action="decrease"]');
  const reloadedReset = reloadedControls.locator('[data-principles-text-action="reset"]');
  const reloadedIncrease = reloadedControls.locator('[data-principles-text-action="increase"]');
  const reloadedStatus = reloadedControls.locator("[data-principles-text-status]");
  const reloadedBody = page.locator(".tjm-fm-principle-body > p");
  assert.equal(await page.locator("html").getAttribute("data-principles-text-step"), "9");
  assert.equal((await reloadedStatus.textContent()).trim(), "10 of 20");

  previousSize = Number.parseFloat(await reloadedBody.evaluate((element) => getComputedStyle(element).fontSize));
  for (let expectedStep = 10; expectedStep <= 19; expectedStep += 1) {
    await reloadedIncrease.click();
    assert.equal(await page.locator("html").getAttribute("data-principles-text-step"), String(expectedStep));
    const nextSize = Number.parseFloat(await reloadedBody.evaluate((element) => getComputedStyle(element).fontSize));
    assert.ok(nextSize > previousSize, `Size ${expectedStep + 1} should exceed size ${expectedStep}.`);
    previousSize = nextSize;
  }
  const maximumSize = previousSize;
  assert.equal((await reloadedStatus.textContent()).trim(), "20 of 20");
  assert.equal(await reloadedIncrease.isDisabled(), true);
  assert.equal(await page.evaluate(() => localStorage.getItem("tjm-principles-text-size")), "19");

  await reloadedDecrease.click();
  assert.equal(await page.locator("html").getAttribute("data-principles-text-step"), "18");
  previousSize = Number.parseFloat(await reloadedBody.evaluate((element) => getComputedStyle(element).fontSize));
  assert.ok(previousSize < maximumSize, "One minus tap should reduce the maximum text size by one step.");
  for (let expectedStep = 17; expectedStep >= 0; expectedStep -= 1) {
    await reloadedDecrease.click();
    assert.equal(await page.locator("html").getAttribute("data-principles-text-step"), String(expectedStep));
    const nextSize = Number.parseFloat(await reloadedBody.evaluate((element) => getComputedStyle(element).fontSize));
    assert.ok(nextSize < previousSize, `Size ${expectedStep + 1} should be smaller than size ${expectedStep + 2}.`);
    previousSize = nextSize;
  }
  assert.equal((await reloadedStatus.textContent()).trim(), "1 of 20");
  assert.equal(await reloadedDecrease.isDisabled(), true);
  assert.ok(previousSize < defaultSize, `Minimum text (${previousSize}px) should be smaller than default (${defaultSize}px).`);

  await reloadedReset.click();
  assert.equal(await page.locator("html").getAttribute("data-principles-text-step"), "6");
  assert.equal((await reloadedStatus.textContent()).trim(), "7 of 20");
  assert.equal(await reloadedReset.getAttribute("aria-pressed"), "true");
  assert.equal(await page.evaluate(() => localStorage.getItem("tjm-principles-text-size")), "6");

  await page.evaluate(() => localStorage.setItem("tjm-principles-text-size", "large"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".tjm-fm-text-controls").waitFor({ state: "visible" });
  assert.equal(await page.locator("html").getAttribute("data-principles-text-step"), "10");
  assert.equal((await page.locator("[data-principles-text-status]").textContent()).trim(), "11 of 20");

  assert.deepEqual(errors, [], `Browser errors:\n${errors.join("\n")}`);
  console.log("Readable introduction and 20-step Principles text-size browser test passed.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
