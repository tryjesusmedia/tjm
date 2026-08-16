import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const root = path.resolve("knowledge/sources");
const allowed = new Set([".txt", ".md", ".html", ".pdf"]);

async function walk(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (allowed.has(path.extname(entry.name).toLowerCase())) files.push(full);
  }
  return files;
}

let vectorStoreId = process.env.OPENAI_VECTOR_STORE_ID;
if (!vectorStoreId) {
  const store = await client.vectorStores.create({ name: "Pastor Kal Knowledge Base v1" });
  vectorStoreId = store.id;
  console.log(`Created vector store: ${vectorStoreId}`);
}

const files = await walk(root);
if (!files.length) {
  console.error("No knowledge files found.");
  process.exit(1);
}

for (const filePath of files) {
  const rel = path.relative(process.cwd(), filePath);
  process.stdout.write(`Uploading ${rel} ... `);
  const uploaded = await client.files.create({
    file: fs.createReadStream(filePath),
    purpose: "assistants",
  });
  await client.vectorStores.files.create(vectorStoreId, { file_id: uploaded.id });
  console.log("attached");
}

console.log("\nKnowledge files attached. Indexing may take a short period on the OpenAI side.");
console.log(`OPENAI_VECTOR_STORE_ID=${vectorStoreId}`);
