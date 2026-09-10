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
    let file = join(root, relative || "scripts/reading-principle-names-smoke.html");
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
const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

try {
  await page.goto(`http://127.0.0.1:${address.port}/scripts/reading-principle-names-smoke.html`, {
    waitUntil: "domcontentloaded",
  });

  const createForm = page.locator("#principle-form");
  await createForm.waitFor();
  assert.equal(await createForm.getByLabel("Principle name", { exact: true }).count(), 1);
  assert.equal(await createForm.getByLabel("Principle name", { exact: true }).inputValue(), "Principle #1");

  await createForm.getByLabel("Principle number", { exact: true }).fill("6");
  assert.equal(await createForm.getByLabel("Principle name", { exact: true }).inputValue(), "Principle #6");

  await createForm.getByLabel("Principle name", { exact: true }).fill("Creation reveals God's character");
  await createForm.getByLabel("The principle I see", { exact: true }).fill("Creation shows that God's power and goodness work together.");
  await createForm.getByRole("button", { name: "Save principle", exact: true }).click();

  await page.waitForSelector(".principle-mini-identity");
  assert.equal((await page.locator(".principle-mini-identity strong").textContent())?.trim(), "Creation reveals God's character");
  let calls = await page.evaluate(() => window.__rpcCalls);
  assert.ok(calls.some((call) => call.name === "create_conflict_principle" && call.args.p_principle_number === 6));
  assert.ok(calls.some((call) => call.name === "set_conflict_principle_name" && call.args.p_name === "Creation reveals God's character"));

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const editForm = page.locator('.principle-edit-form[data-principle-context="reading"]');
  await editForm.waitFor();
  assert.equal(await editForm.getByLabel("Principle name", { exact: true }).inputValue(), "Creation reveals God's character");
  await editForm.getByLabel("Principle name", { exact: true }).fill("God's character in creation");
  await editForm.getByRole("button", { name: "Save changes", exact: true }).click();

  await page.waitForFunction(() => document.querySelector(".principle-mini-identity strong")?.textContent?.includes("God's character in creation"));
  assert.equal((await page.locator(".principle-mini-identity strong").textContent())?.trim(), "God's character in creation");
  calls = await page.evaluate(() => window.__rpcCalls);
  assert.ok(calls.some((call) => call.name === "update_conflict_principle" && call.args.p_principle_id === "principle-one"));
  assert.ok(calls.some((call) => call.name === "set_conflict_principle_name" && call.args.p_name === "God's character in creation"));

  // Clearing a custom name restores the automatic “Principle #N” name.
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const clearForm = page.locator('.principle-edit-form[data-principle-context="reading"]');
  await clearForm.getByLabel("Principle name", { exact: true }).fill("");
  await clearForm.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.waitForSelector(".principle-mini-identity", { state: "detached" });
  calls = await page.evaluate(() => window.__rpcCalls);
  assert.ok(calls.some((call) => call.name === "set_conflict_principle_name" && call.args.p_name === null));

  assert.deepEqual(errors, [], `Browser errors:\n${errors.join("\n")}`);
  console.log("Reading-assignment principle name browser test passed.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
