import assert from "node:assert/strict";
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const types = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8" };
const server = http.createServer(async (request, response) => {
  try {
    const relative = normalize(decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/^\/+/, ""));
    if (relative.startsWith("..")) throw new Error("Invalid path");
    let file = join(root, relative || "scripts/folders-mindmap-smoke.html");
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    response.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    response.end(await readFile(file));
  } catch (_error) {
    response.writeHead(404); response.end("Not found");
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto(`http://127.0.0.1:${address.port}/scripts/folders-mindmap-smoke.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".tjm-fm-window .react-flow", { timeout: 45_000 });

  const windowBox = await page.locator(".tjm-fm-window").boundingBox();
  assert.ok(windowBox && windowBox.x > 0 && windowBox.y > 0);
  assert.ok(windowBox.x + windowBox.width < 1280);
  assert.ok(windowBox.y + windowBox.height < 900);
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflow), "visible");

  assert.equal(await page.getByText("Group led by", { exact: false }).count(), 0);
  assert.equal(await page.getByText("New Folder #1", { exact: true }).count(), 1);
  assert.equal(await page.locator('[data-fm-principle-id="p3"] .tjm-fm-principle-preview').count(), 1);

  // Standalone principle menus offer Edit, Add to Folder, Delete.
  await page.locator('[data-fm-principle-id="p3"] .tjm-fm-node-menu').click();
  assert.deepEqual(await page.locator(".tjm-fm-context-menu button").allTextContents(), ["Edit", "Add to Folder", "Delete"]);
  await page.waitForTimeout(75);
  await page.locator(".tjm-fm-sticky-header").click({ position: { x: 10, y: 10 } });
  await page.waitForSelector(".tjm-fm-context-menu", { state: "detached", timeout: 5_000 });

  // No principle-on-principle filing: overlapping two principle nodes never invokes move_conflict_principles.
  const sourceHandle = page.locator('[data-fm-principle-id="p3"] .fm-node-drag-handle');
  const targetNode = page.locator('[data-fm-principle-id="p4"]');
  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await targetNode.boundingBox();
  assert.ok(sourceBox && targetBox);
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__rpcCalls.filter((call) => call.name === "move_conflict_principles").length), 0);
  assert.equal(await page.evaluate(() => window.__wentToReading), undefined);
  assert.deepEqual(errors, [], `Browser errors before folder open:\n${errors.join("\n")}`);

  // Open a folder, expand a principle, and verify the requested three-item menu.
  const folderButton = page.locator('[data-fm-folder-id="g1"] .tjm-fm-folder-open');
  console.log(`Folder button visible: ${await folderButton.isVisible()}`);
  await folderButton.click();
  await page.waitForTimeout(600);
  const titleCountAfterClick = await page.locator(".tjm-fm-title-row h2").count();
  const backCountAfterClick = await page.locator(".tjm-fm-back").count();
  const windowCountAfterClick = await page.locator(".tjm-fm-window").count();
  const hostCountAfterClick = await page.locator(".tjm-fm-host").count();
  const bodyTextAfterClick = (await page.locator("body").innerText()).slice(0, 1200);
  console.log(`After click: titleCount=${titleCountAfterClick}; back=${backCountAfterClick}; window=${windowCountAfterClick}; host=${hostCountAfterClick}; errors=${JSON.stringify(errors)}; body=${JSON.stringify(bodyTextAfterClick)}`);
  assert.equal(windowCountAfterClick, 1, "The floating Mind Map window should remain mounted after opening a folder.");
  assert.equal(titleCountAfterClick, 1, `The sticky title should remain mounted. Browser errors: ${errors.join(" | ")}`);
  assert.equal(backCountAfterClick, 1, `Opening a folder should show the Back button. Browser errors: ${errors.join(" | ")}`);
  const folderTitle = (await page.locator(".tjm-fm-title-row h2").textContent())?.trim();
  assert.equal(folderTitle, "New Folder #1");
  const principleInFolder = page.locator('[data-fm-principle-id="p1"]');
  await principleInFolder.locator(".tjm-fm-principle-preview").click();
  await page.waitForFunction(() => document.querySelector('[data-fm-principle-id="p1"]')?.classList.contains("is-expanded"));
  assert.equal(await principleInFolder.locator(".tjm-fm-principle-bottom button", { hasText: "Edit" }).count(), 0);
  assert.equal(await principleInFolder.locator(".tjm-fm-principle-bottom button", { hasText: "standalone" }).count(), 0);
  await principleInFolder.locator(".tjm-fm-node-menu").click();
  assert.deepEqual(await page.locator(".tjm-fm-context-menu button").allTextContents(), ["Edit", "Remove from Folder", "Delete"]);

  await page.locator(".tjm-fm-context-menu button", { hasText: "Remove from Folder" }).click();
  await page.waitForSelector(".tjm-fm-back", { state: "detached" });
  assert.equal(await page.locator('[data-fm-principle-id="p1"]').count(), 1);

  // Persistent close/open control keeps the rest of the page scrollable.
  await page.locator(".tjm-fm-persistent-toggle").click();
  await page.waitForSelector(".tjm-fm-window", { state: "detached" });
  assert.equal(await page.locator(".tjm-fm-persistent-toggle").innerText(), "Open Mind Map");
  await page.evaluate(() => window.scrollTo(0, 900));
  assert.ok(await page.evaluate(() => window.scrollY) > 500);
  await page.locator(".tjm-fm-persistent-toggle").click();
  await page.waitForSelector(".tjm-fm-window");

  assert.deepEqual(errors, [], `Browser errors:\n${errors.join("\n")}`);
  console.log("Folder Mind Map browser smoke test passed.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
