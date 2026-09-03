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
  await page.waitForSelector(".tjm-rf-host .react-flow", { timeout: 45_000 });

  assert.equal(await page.locator("#view-root > .principles-view").evaluate((element) => element.classList.contains("tjm-rf-original-hidden")), true);
  assert.equal(await page.locator('.tjm-rf-group-node[data-rf-group-id="g1"]').count(), 1);
  assert.equal(await page.locator('[data-rf-principle-id="p3"]').count(), 1);
  assert.match(await page.locator('[data-rf-principle-id="p3"] .tjm-rf-preview').innerText(), /^Prayer makes room/);
  assert.equal(await page.getByText("Mind Map Arena", { exact: true }).count(), 0);

  const standalone = page.locator('[data-rf-principle-id="p3"]');
  await standalone.locator(".tjm-rf-preview").click();
  await page.waitForFunction(() => document.querySelector('[data-rf-principle-id="p3"]')?.classList.contains("is-expanded"));
  assert.match(await standalone.locator(".tjm-rf-expanded-body > p").innerText(), /listen before reacting/);

  await standalone.locator(".tjm-rf-expanded-actions button", { hasText: "Edit" }).click();
  const editor = page.locator(".tjm-rf-editor-sheet");
  await editor.waitFor();
  await editor.locator('textarea[name="principle-body"]').fill("Prayer creates calm space to listen before reacting.");
  await editor.locator('button[type="submit"]').click();
  await editor.waitFor({ state: "detached" });
  await page.waitForFunction(() => document.querySelector('[data-rf-principle-id="p3"]')?.classList.contains("is-expanded"));
  assert.match(await standalone.locator(".tjm-rf-expanded-body > p").innerText(), /creates calm space/);
  assert.equal(await page.evaluate(() => window.__wentToReading), undefined);

  // A drag starts only from the circled number. It changes node position and
  // must never call the reading-navigation callback.
  await standalone.locator(".tjm-rf-preview").click();
  const handle = standalone.locator(".rf-node-drag-handle");
  const flowNode = standalone.locator("xpath=ancestor::div[contains(@class,'react-flow__node')]");
  const beforeTransform = await flowNode.evaluate((element) => element.style.transform);
  const box = await handle.boundingBox();
  assert.ok(box, "The principle drag handle should be visible");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 65, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(120);
  const afterTransform = await flowNode.evaluate((element) => element.style.transform);
  assert.notEqual(afterTransform, beforeTransform);
  assert.equal(await page.evaluate(() => window.__wentToReading), undefined);

  await page.locator('.tjm-rf-group-node[data-rf-group-id="g1"] .tjm-rf-group-open').click();
  await page.waitForFunction(() => document.querySelector("#tjm-rf-heading")?.textContent === "Grace");
  assert.equal(await page.locator('.tjm-rf-flow-wrap [data-rf-principle-id="p1"]').count(), 1);
  assert.equal(await page.locator('.tjm-rf-flow-wrap [data-rf-principle-id="p2"]').count(), 1);

  const groupedPrinciple = page.locator('.tjm-rf-flow-wrap [data-rf-principle-id="p1"]');
  await groupedPrinciple.locator(".tjm-rf-preview").click();
  await page.waitForFunction(() => document.querySelector('.tjm-rf-flow-wrap [data-rf-principle-id="p1"]')?.classList.contains("is-expanded"));
  await groupedPrinciple.locator(".tjm-rf-expanded-actions button", { hasText: "Edit" }).click();
  await page.locator(".tjm-rf-editor-sheet").waitFor();
  await page.locator(".tjm-rf-editor-sheet button", { hasText: "Cancel" }).click();
  await page.waitForFunction(() => document.querySelector('.tjm-rf-flow-wrap [data-rf-principle-id="p1"]')?.classList.contains("is-expanded"));

  const viewport = page.locator(".react-flow__viewport");
  const beforeZoom = await viewport.evaluate((element) => element.style.transform);
  await page.locator(".react-flow__controls-zoomin").click();
  await page.waitForTimeout(120);
  const afterZoom = await viewport.evaluate((element) => element.style.transform);
  assert.notEqual(afterZoom, beforeZoom);

  assert.deepEqual(errors, [], `Browser console/page errors:\n${errors.join("\n")}`);
  console.log("React Flow browser smoke test passed.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
