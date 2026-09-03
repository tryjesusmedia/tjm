import assert from "node:assert/strict";
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = normalize(pathname.replace(/^\/+/, ""));
    if (relative.startsWith("..")) throw new Error("Invalid path");
    let file = join(root, relative || "scripts/react-flow-smoke.html");
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    response.writeHead(200, {
      "content-type": mime[extname(file)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(body);
  } catch (_error) {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("Not found");
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const baseURL = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

try {
  await page.goto(`${baseURL}/scripts/react-flow-smoke.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".tjm-folder-map-frame .react-flow", { timeout: 45_000 });

  assert.equal(await page.locator("#view-root > .principles-view").evaluate((element) => element.classList.contains("tjm-rf-original-hidden")), true);
  assert.equal(await page.locator(".tjm-folder-map-toggle").innerText(), "×Close Mind Map");
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflow === "hidden"), false);
  assert.ok(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight * 2));

  const overlayPosition = await page.locator(".tjm-folder-map-overlay").evaluate((element) => getComputedStyle(element).position);
  const headerPosition = await page.locator(".tjm-folder-sticky-header").evaluate((element) => getComputedStyle(element).position);
  assert.equal(overlayPosition, "fixed");
  assert.equal(headerPosition, "relative");
  const frameBox = await page.locator(".tjm-folder-map-frame").boundingBox();
  assert.ok(frameBox && frameBox.x >= 5 && frameBox.y >= 5);
  assert.ok(frameBox.x + frameBox.width <= 1275 && frameBox.y + frameBox.height <= 895);

  await page.waitForFunction(() => document.body.innerText.includes("New Folder #31"));
  assert.equal(await page.locator('.tjm-folder-folder-node[data-folder-id="g1"] .tjm-folder-open strong').innerText(), "Grace");
  assert.equal(await page.locator('.tjm-folder-folder-node[data-folder-id="g2"] .tjm-folder-open strong').innerText(), "New Folder #31");
  const visibleMapText = (await page.locator(".tjm-folder-map-frame").innerText()).toLowerCase();
  assert.equal(visibleMapText.includes("group"), false);
  assert.equal(visibleMapText.includes("standalone"), false);

  const rootPrinciple = page.locator('[data-folder-principle-id="p3"]');
  assert.equal(await rootPrinciple.count(), 1);
  assert.match(await rootPrinciple.locator(".tjm-folder-principle-preview").innerText(), /^Prayer makes room/);

  // The persistent button closes and reopens the fixed map while the page can
  // continue scrolling behind it.
  await page.locator(".tjm-folder-map-toggle").click();
  await page.waitForSelector(".tjm-folder-map-overlay", { state: "detached" });
  assert.equal(await page.locator(".tjm-folder-map-toggle").innerText(), "⌘Open Mind Map");
  await page.evaluate(() => window.scrollTo(0, 650));
  assert.equal(await page.evaluate(() => Math.round(window.scrollY)), 650);
  await page.locator(".tjm-folder-map-toggle").click();
  await page.waitForSelector(".tjm-folder-map-frame .react-flow");
  const reopenedBox = await page.locator(".tjm-folder-map-frame").boundingBox();
  assert.ok(reopenedBox && reopenedBox.y >= 5 && reopenedBox.y <= 12);

  // Create a folder explicitly. A folder is never created by dropping one
  // principle on another.
  await page.locator(".tjm-folder-tools-toggle").click();
  await page.locator(".tjm-folder-toolbar button", { hasText: "+ New folder" }).click();
  await page.waitForFunction(() => document.body.innerText.includes("New Folder #32"));
  let newFolder = page.locator('.tjm-folder-empty-node', { hasText: "New Folder #32" });
  assert.equal(await newFolder.count(), 1);

  // Add the root principle through the folder itself.
  await newFolder.locator(".tjm-folder-node-menu").click();
  const emptyFolderMenu = page.locator(".tjm-folder-context-menu");
  assert.deepEqual(await emptyFolderMenu.locator("button").allInnerTexts(), ["Rename folder", "Add principles", "Delete folder"]);
  await emptyFolderMenu.locator("button", { hasText: "Add principles" }).click();
  const addDialog = page.locator(".tjm-folder-add-dialog");
  await addDialog.waitFor();
  await addDialog.locator('input[type="checkbox"]').check();
  await addDialog.locator(".tjm-folder-sheet-actions button.is-primary").click();
  await addDialog.waitFor({ state: "detached" });
  await page.waitForFunction(() => !document.querySelector('[data-folder-principle-id="p3"]') && document.body.innerText.includes("New Folder #32"));

  const filledFolder = page.locator('.tjm-folder-folder-node', { hasText: "New Folder #32" });
  assert.equal(await filledFolder.count(), 1);
  await filledFolder.locator(".tjm-folder-open").click();
  await page.waitForFunction(() => document.querySelector(".tjm-folder-title-block h2")?.textContent === "New Folder #32");

  const folderPrinciple = page.locator('[data-folder-principle-id="p3"]');
  await folderPrinciple.locator(".tjm-folder-principle-preview").click();
  await page.waitForFunction(() => document.querySelector('[data-folder-principle-id="p3"]')?.classList.contains("is-expanded"));
  assert.match(await page.locator(".tjm-folder-title-block h2").innerText(), /^Prayer makes room/);
  assert.deepEqual(await folderPrinciple.locator(".tjm-folder-expanded-body button").allInnerTexts(), ["Go to reading"]);

  // Editing is available from the menu, while removing from a folder returns
  // the principle to the main Mind Map without a page flash.
  await folderPrinciple.locator(".tjm-folder-node-menu").click();
  const principleMenu = page.locator(".tjm-folder-context-menu");
  assert.deepEqual(await principleMenu.locator("button").allInnerTexts(), ["Edit", "Remove from folder", "Delete"]);
  await principleMenu.locator("button", { hasText: "Edit" }).click();
  const editor = page.locator(".tjm-folder-editor-sheet");
  await editor.waitFor();
  await editor.locator('textarea[name="principle-body"]').fill("Prayer creates calm space to listen before reacting.");
  await editor.locator('button[type="submit"]').click();
  await editor.waitFor({ state: "detached" });
  await page.waitForFunction(() => document.querySelector('[data-folder-principle-id="p3"] .tjm-folder-expanded-body > p')?.textContent.includes("creates calm space"));
  assert.equal(await page.evaluate(() => window.__wentToReading), undefined);

  await folderPrinciple.locator(".tjm-folder-node-menu").click();
  await page.locator(".tjm-folder-context-menu button", { hasText: "Remove from folder" }).click();
  await page.waitForFunction(() => document.querySelector('.tjm-folder-title-block h2')?.textContent === "Prayer creates calm space to listen before reacting.");
  await page.waitForFunction(() => Boolean(document.querySelector('[data-folder-principle-id="p3"]')));
  assert.equal(await page.locator('.tjm-folder-empty-node', { hasText: "New Folder #32" }).count(), 1);

  const rootMenuButton = page.locator('[data-folder-principle-id="p3"] .tjm-folder-node-menu');
  await rootMenuButton.click();
  assert.deepEqual(await page.locator(".tjm-folder-context-menu button").allInnerTexts(), ["Edit", "Delete"]);

  // Panning/zooming stays inside the bounded React Flow viewport and does not
  // move the fixed frame with the document.
  const viewport = page.locator(".react-flow__viewport");
  const beforeZoom = await viewport.evaluate((element) => element.style.transform);
  await page.locator(".react-flow__controls-zoomin").click();
  await page.waitForTimeout(120);
  const afterZoom = await viewport.evaluate((element) => element.style.transform);
  assert.notEqual(afterZoom, beforeZoom);
  const frameAfterScroll = await page.locator(".tjm-folder-map-frame").boundingBox();
  assert.ok(frameAfterScroll && Math.abs(frameAfterScroll.y - reopenedBox.y) < 1);

  assert.deepEqual(errors, [], `Browser console/page errors:\n${errors.join("\n")}`);
  console.log("Folder-based React Flow browser smoke test passed.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
