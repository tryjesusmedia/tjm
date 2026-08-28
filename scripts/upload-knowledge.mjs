import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import OpenAI from "openai";

// ============================================================================
// SMART KNOWLEDGE UPLOAD WITH MANIFEST TRACKING
// Prevents duplicate uploads and efficiently updates changed files
// ============================================================================

const KNOWLEDGE_ROOT = path.resolve("knowledge/sources");
const OPENAI_MANIFEST_PATH = "knowledge/openai-sync-manifest.json";
const ALLOWED_EXTENSIONS = new Set([".txt", ".md", ".html", ".pdf"]);
const SYNC_MODE = process.argv.includes("--sync");
const scopeArg = process.argv.find((value) => value.startsWith("--scope="));
const scope = scopeArg?.slice("--scope=".length).trim() || "";
const SYNC_ROOT = scope ? path.resolve(KNOWLEDGE_ROOT, scope) : KNOWLEDGE_ROOT;
const scopeRelative = path.relative(KNOWLEDGE_ROOT, SYNC_ROOT);

if (scopeRelative.startsWith("..") || path.isAbsolute(scopeRelative)) {
  console.error("Knowledge scope must stay inside knowledge/sources.");
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ============================================================================
// Manifest Management
// ============================================================================

async function loadOpenAIManifest() {
  try {
    if (!fs.existsSync(OPENAI_MANIFEST_PATH)) {
      return { lastSyncTime: null, vectorStoreId: null, files: {} };
    }
    const data = await fsp.readFile(OPENAI_MANIFEST_PATH, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Error loading OpenAI manifest:", err.message);
    return { lastSyncTime: null, vectorStoreId: null, files: {} };
  }
}

async function saveOpenAIManifest(manifest) {
  await fsp.mkdir(path.dirname(OPENAI_MANIFEST_PATH), { recursive: true });
  await fsp.writeFile(OPENAI_MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

function computeFileHash(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function manifestPath(filePath) {
  return path.relative(process.cwd(), filePath).split(path.sep).join("/");
}

// ============================================================================
// File Operations
// ============================================================================

async function walk(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(full));
    } else if (ALLOWED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(full);
    }
  }
  return files;
}

async function getFileHash(filePath) {
  const data = await fsp.readFile(filePath);
  return computeFileHash(data);
}

// ============================================================================
// OpenAI Operations
// ============================================================================

async function uploadFileToOpenAI(filePath) {
  const rel = manifestPath(filePath);
  process.stdout.write(`  Uploading ${rel} ... `);
  
  try {
    const uploaded = await client.files.create({
      file: fs.createReadStream(filePath),
      purpose: "assistants",
    });
    console.log(`uploaded (ID: ${uploaded.id})`);
    return uploaded;
  } catch (err) {
    console.error(`\n  ✗ Upload failed: ${err.message}`);
    throw err;
  }
}

async function attachFileToVectorStore(vectorStoreId, fileId) {
  try {
    await client.vectorStores.files.create(vectorStoreId, { file_id: fileId });
    return true;
  } catch (err) {
    console.error(`  ✗ Failed to attach file ${fileId} to vector store: ${err.message}`);
    return false;
  }
}

async function removeFileFromVectorStore(vectorStoreId, fileId) {
  try {
    await client.vectorStores.files.delete(vectorStoreId, fileId);
    return true;
  } catch (err) {
    console.error(`  ✗ Failed to remove file ${fileId} from vector store: ${err.message}`);
    return false;
  }
}

async function deleteOpenAIFile(fileId) {
  try {
    await client.files.del(fileId);
    return true;
  } catch (err) {
    console.error(`  ✗ Failed to delete OpenAI file ${fileId}: ${err.message}`);
    return false;
  }
}

// ============================================================================
// Sync Logic
// ============================================================================

async function syncKnowledgeFiles(manifest, vectorStoreId) {
  const files = await walk(SYNC_ROOT);
  if (!files.length) {
    console.error("No knowledge files found.");
    process.exit(1);
  }

  let newCount = 0;
  let unchangedCount = 0;
  let updatedCount = 0;

  console.log(`\nProcessing ${files.length} knowledge files (sync mode: ${SYNC_MODE}, scope: ${scope || "all"})...\n`);

  for (const filePath of files) {
    const rel = manifestPath(filePath);
    const hash = await getFileHash(filePath);
    const manifestEntry = manifest.files[rel];

    if (manifestEntry && manifestEntry.hash === hash) {
      console.log(`✓ Unchanged: ${rel}`);
      unchangedCount++;
      continue;
    }

    if (manifestEntry && manifestEntry.hash !== hash) {
      console.log(`⟳ Changed: ${rel}`);
      console.log(`  Removing old file ${manifestEntry.openaiFileId} from vector store...`);
      
      if (await removeFileFromVectorStore(vectorStoreId, manifestEntry.openaiFileId)) {
        await deleteOpenAIFile(manifestEntry.openaiFileId);
        console.log(`  ✓ Old version removed`);
      }
      updatedCount++;
    } else {
      console.log(`↓ New: ${rel}`);
      newCount++;
    }

    // Upload new/updated file
    try {
      const uploaded = await uploadFileToOpenAI(filePath);
      const attached = await attachFileToVectorStore(vectorStoreId, uploaded.id);
      
      if (attached) {
        manifest.files[rel] = {
          hash: hash,
          openaiFileId: uploaded.id,
          uploadedAt: new Date().toISOString()
        };
        console.log(`  ✓ Attached to vector store\n`);
      } else {
        console.log(`  ⚠ File uploaded but not attached. Skipping manifest update.\n`);
      }
    } catch (err) {
      console.error(`  ✗ Failed to process ${rel}: ${err.message}\n`);
    }
  }

  return { newCount, unchangedCount, updatedCount };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  try {
    console.log("Pastor Kal Knowledge Base Sync");
    console.log("===============================\n");

    let vectorStoreId = process.env.OPENAI_VECTOR_STORE_ID;
    const manifest = await loadOpenAIManifest();

    if (SYNC_MODE) {
      console.log("MODE: Smart Sync (checking manifests)");
      
      if (!vectorStoreId) {
        console.log("No OPENAI_VECTOR_STORE_ID provided. Creating new vector store...");
        const store = await client.vectorStores.create({ 
          name: "Pastor Kal Knowledge Base v1" 
        });
        vectorStoreId = store.id;
        console.log(`Created vector store: ${vectorStoreId}\n`);
      }

      manifest.vectorStoreId = vectorStoreId;
      const stats = await syncKnowledgeFiles(manifest, vectorStoreId);

      console.log("\n─────────────────────────────");
      console.log(`New files:       ${stats.newCount}`);
      console.log(`Updated files:   ${stats.updatedCount}`);
      console.log(`Unchanged files: ${stats.unchangedCount}`);
    } else {
      console.log("MODE: Full Upload (no manifest checking)");
      console.warn("⚠ Warning: This will upload all files. Consider using --sync to skip duplicates.\n");
      
      if (!vectorStoreId) {
        const store = await client.vectorStores.create({ 
          name: "Pastor Kal Knowledge Base v1" 
        });
        vectorStoreId = store.id;
        console.log(`Created vector store: ${vectorStoreId}\n`);
      }

      manifest.vectorStoreId = vectorStoreId;
      const files = await walk(SYNC_ROOT);
      
      if (!files.length) {
        console.error("No knowledge files found.");
        process.exit(1);
      }

      for (const filePath of files) {
        try {
          const uploaded = await uploadFileToOpenAI(filePath);
          await attachFileToVectorStore(vectorStoreId, uploaded.id);
          
          const rel = manifestPath(filePath);
          const hash = await getFileHash(filePath);
          manifest.files[rel] = {
            hash: hash,
            openaiFileId: uploaded.id,
            uploadedAt: new Date().toISOString()
          };
          console.log(`✓ attached`);
        } catch (err) {
          console.error(`Failed: ${err.message}`);
        }
      }
    }

    manifest.lastSyncTime = new Date().toISOString();
    await saveOpenAIManifest(manifest);

    console.log("\n✓ Knowledge base sync complete");
    console.log(`Vector Store ID: ${vectorStoreId}`);
    console.log("\nSet this environment variable in Cloudflare Pages:");
    console.log(`OPENAI_VECTOR_STORE_ID=${vectorStoreId}`);
  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
  }
}

main();
