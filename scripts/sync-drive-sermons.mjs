import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { google } from "googleapis";
import mammoth from "mammoth";

// ============================================================================
// GOOGLE DRIVE SERMON SYNC
// Syncs approved teaching folders from Google Drive into knowledge/sources/sermons/
// Tracks changes via knowledge/drive-sync-manifest.json
// SECURITY: Only enters approved top-level folders, recursively includes all subfolders
// ============================================================================

const APPROVED_FOLDERS = new Set([
  "2024",
  "2025",
  "2026",
  "Favourite Sermons",
  "Natural Law",
  "End Times",
  "Devotional",
  "Bible Studies"
]);

const SUPPORTED_TYPES = {
  "application/vnd.google-apps.document": "google_doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/markdown": "md"
};

const OUTPUT_DIR = "knowledge/sources/sermons";
const MANIFEST_PATH = "knowledge/drive-sync-manifest.json";
const DRY_RUN = process.argv.includes("--dry-run");
const STATS = { new: 0, unchanged: 0, updated: 0, skipped: 0, error: 0 };

// ============================================================================
// Configuration
// ============================================================================

function validateEnv() {
  const required = [
    "GOOGLE_DRIVE_CLIENT_ID",
    "GOOGLE_DRIVE_CLIENT_SECRET",
    "GOOGLE_DRIVE_REFRESH_TOKEN",
    "GOOGLE_DRIVE_BIBLE_FOLDER_ID"
  ];
  
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error("Missing required Google Drive environment variables:");
    missing.forEach(key => console.error(`  ${key}`));
    process.exit(1);
  }
}

async function createAuthClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    "urn:ietf:wg:oauth:2.0:oob"
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN
  });

  return oauth2Client;
}

// ============================================================================
// Manifest Management
// ============================================================================

async function loadManifest() {
  try {
    if (!fs.existsSync(MANIFEST_PATH)) {
      return { lastSyncTime: null, driveItems: {} };
    }
    const data = await fsp.readFile(MANIFEST_PATH, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Error loading manifest:", err.message);
    return { lastSyncTime: null, driveItems: {} };
  }
}

async function saveManifest(manifest) {
  await fsp.mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
  await fsp.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

function computeFileHash(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

// ============================================================================
// Google Drive API Operations
// ============================================================================

async function getDriveFolderByName(drive, parentFolderId, folderName) {
  try {
    const response = await drive.files.list({
      q: `'${parentFolderId}' in parents and name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      spaces: "drive",
      fields: "files(id, name, mimeType, modifiedTime)",
      pageSize: 1
    });
    
    if (response.data.files && response.data.files.length > 0) {
      return response.data.files[0];
    }
    return null;
  } catch (err) {
    console.error(`Error finding folder "${folderName}":`, err.message);
    return null;
  }
}

async function listDriveFolderContents(drive, folderId, approvedSubfolders = null) {
  const items = [];
  let pageToken = null;

  try {
    do {
      const response = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        spaces: "drive",
        fields: "files(id, name, mimeType, modifiedTime, size), nextPageToken",
        pageSize: 1000,
        pageToken: pageToken
      });

      if (response.data.files) {
        for (const file of response.data.files) {
          // If checking approved subfolders and this is a folder, only include if approved
          if (approvedSubfolders && file.mimeType === "application/vnd.google-apps.folder") {
            if (!approvedSubfolders.has(file.name)) continue;
          }
          items.push(file);
        }
      }
      pageToken = response.data.nextPageToken;
    } while (pageToken);
  } catch (err) {
    console.error(`Error listing folder ${folderId}:`, err.message);
  }

  return items;
}

async function exportGoogleDoc(drive, fileId, fileName) {
  try {
    // Export as markdown for better content preservation
    const response = await drive.files.export({
      fileId: fileId,
      mimeType: "text/markdown"
    });
    return response.data;
  } catch (err) {
    console.warn(`Could not export Google Doc as markdown, trying plaintext:`, err.message);
    try {
      const response = await drive.files.export({
        fileId: fileId,
        mimeType: "text/plain"
      });
      return response.data;
    } catch (err2) {
      console.error(`Failed to export Google Doc ${fileId}:`, err2.message);
      return null;
    }
  }
}

async function downloadFile(drive, fileId, fileName) {
  try {
    const response = await drive.files.get(
      { fileId: fileId, alt: "media" },
      { responseType: "stream" }
    );
    return response.data;
  } catch (err) {
    console.error(`Failed to download file ${fileId}:`, err.message);
    return null;
  }
}

async function downloadFileBuffer(drive, fileId) {
  try {
    const response = await drive.files.get(
      { fileId: fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );
    return response.data;
  } catch (err) {
    console.error(`Failed to download file buffer ${fileId}:`, err.message);
    return null;
  }
}

// ============================================================================
// File Processing
// ============================================================================

function sanitizeFileName(name) {
  return name
    .replace(/[^\w\s\-\.]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 200);
}

async function processGoogleDoc(drive, driveFile, localPath, drivePath) {
  console.log(`  Exporting Google Doc: ${driveFile.name}`);
  const content = await exportGoogleDoc(drive, driveFile.id, driveFile.name);
  
  if (!content) return null;

  const metadata = createFileMetadata(driveFile, "Google Doc", drivePath);
  const fullContent = `${metadata}\n\n${content}`;
  
  if (!DRY_RUN) {
    await fsp.mkdir(path.dirname(localPath), { recursive: true });
    await fsp.writeFile(localPath, fullContent, "utf8");
  }
  
  return computeFileHash(fullContent);
}

async function processDocxFile(drive, driveFile, localPath, drivePath) {
  console.log(`  Processing DOCX: ${driveFile.name}`);
  const buffer = await downloadFileBuffer(drive, driveFile.id);
  if (!buffer) return null;

  try {
    // Extract text from DOCX using mammoth
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    const text = result.value;
    
    // Save as markdown with metadata
    const mdPath = localPath.replace(/\.docx$/, ".md");
    const metadata = createFileMetadata(driveFile, "DOCX Document", drivePath);
    const fullContent = `${metadata}\n\n${text}`;
    
    if (!DRY_RUN) {
      await fsp.mkdir(path.dirname(mdPath), { recursive: true });
      await fsp.writeFile(mdPath, fullContent, "utf8");
    }
    
    return computeFileHash(fullContent);
  } catch (err) {
    console.error(`Error extracting DOCX ${driveFile.name}:`, err.message);
    return null;
  }
}

async function processPdfFile(drive, driveFile, localPath, drivePath) {
  console.log(`  Downloading PDF: ${driveFile.name}`);
  const stream = await downloadFile(drive, driveFile.id, driveFile.name);
  if (!stream) return null;

  if (!DRY_RUN) {
    await fsp.mkdir(path.dirname(localPath), { recursive: true });
    
    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(localPath);
      stream.pipe(writeStream);
      writeStream.on("finish", async () => {
        const data = await fsp.readFile(localPath);
        resolve(computeFileHash(data));
      });
      writeStream.on("error", (err) => {
        console.error(`Error writing PDF file:`, err.message);
        reject(err);
      });
    });
  } else {
    return computeFileHash(`${driveFile.id}${driveFile.modifiedTime}`);
  }
}

async function processTextFile(drive, driveFile, localPath, drivePath) {
  console.log(`  Downloading text file: ${driveFile.name}`);
  const stream = await downloadFile(drive, driveFile.id, driveFile.name);
  if (!stream) return null;

  if (!DRY_RUN) {
    await fsp.mkdir(path.dirname(localPath), { recursive: true });
    
    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(localPath);
      stream.pipe(writeStream);
      writeStream.on("finish", async () => {
        const data = await fsp.readFile(localPath, "utf8");
        const metadata = createFileMetadata(driveFile, "Text file", drivePath);
        const fullContent = `${metadata}\n\n${data}`;
        await fsp.writeFile(localPath, fullContent, "utf8");
        resolve(computeFileHash(fullContent));
      });
      writeStream.on("error", (err) => {
        console.error(`Error writing text file:`, err.message);
        reject(err);
      });
    });
  } else {
    const metadata = createFileMetadata(driveFile, "Text file", drivePath);
    return computeFileHash(metadata);
  }
}

function createFileMetadata(driveFile, sourceType, drivePath) {
  return `# ${driveFile.name}

**Source Type:** ${sourceType}
**Google Drive File ID:** ${driveFile.id}
**Google Drive Path:** ${drivePath}
**Last Modified:** ${driveFile.modifiedTime || "Unknown"}
**Category:** Pastor Kal Sermon/Teaching

---
`;
}

// ============================================================================
// Recursive Sync
// SECURITY: Only enters approved top-level folders, then recursively includes all subfolders
// ============================================================================

async function syncFolderApprovedRootOnly(drive, folderId, folderName, localBasePath, manifest, drivePath) {
  // At root level, only process folders that are in APPROVED_FOLDERS
  console.log(`\nScanning: ${drivePath || "Bible Root"}`);
  
  const items = await listDriveFolderContents(drive, folderId);
  const folders = items.filter(f => f.mimeType === "application/vnd.google-apps.folder");
  const files = items.filter(f => f.mimeType !== "application/vnd.google-apps.folder");

  // At root level, SKIP all files
  if (files.length > 0 && !drivePath) {
    console.log(`\n  ⊘ SKIPPED (SAFETY): ${files.length} files at Bible root`);
    files.forEach(f => {
      console.log(`     - ${f.name}`);
      STATS.skipped++;
    });
  } else if (files.length > 0) {
    // Inside approved folders, process files normally
    for (const driveFile of files) {
      await processSingleFile(drive, driveFile, localBasePath, manifest, drivePath);
    }
  }

  // Process only approved top-level folders
  for (const folder of folders) {
    if (!drivePath && !APPROVED_FOLDERS.has(folder.name)) {
      // At root, only enter approved folders
      console.log(`  ⊘ Skipping unapproved folder: ${folder.name}`);
      STATS.skipped++;
      continue;
    }

    // Once inside an approved folder, recursively process all subfolders
    const subDrivePath = drivePath ? `${drivePath}/${folder.name}` : folder.name;
    const subLocalPath = path.join(localBasePath, sanitizeFileName(folder.name));
    await syncFolderApprovedRootOnly(drive, folder.id, folder.name, subLocalPath, manifest, subDrivePath);
  }
}

async function processSingleFile(drive, driveFile, localBasePath, manifest, drivePath) {
  const fileType = SUPPORTED_TYPES[driveFile.mimeType];
  if (!fileType) {
    console.log(`  ⊘ Skipping unsupported: ${driveFile.name} (${driveFile.mimeType})`);
    STATS.skipped++;
    return;
  }

  const ext = fileType === "google_doc" ? ".md" : 
              fileType === "docx" ? ".md" :
              fileType === "pdf" ? ".pdf" :
              fileType === "txt" ? ".txt" :
              fileType === "md" ? ".md" : ".txt";

  const localFileName = sanitizeFileName(driveFile.name) + ext;
  const localPath = path.join(localBasePath, localFileName);
  const relativePath = path.relative(process.cwd(), localPath);

  // Check manifest for changes
  const manifestEntry = manifest.driveItems[driveFile.id];
  if (manifestEntry && manifestEntry.modifiedTime === driveFile.modifiedTime) {
    console.log(`  ✓ Unchanged: ${driveFile.name}`);
    STATS.unchanged++;
    return;
  }

  if (manifestEntry) {
    console.log(`  ⟳ Changed: ${driveFile.name}`);
    STATS.updated++;
  } else {
    console.log(`  ↓ New: ${driveFile.name}`);
    STATS.new++;
  }

  let hash = null;

  try {
    if (fileType === "google_doc") {
      hash = await processGoogleDoc(drive, driveFile, localPath, `${drivePath}/${driveFile.name}`);
    } else if (fileType === "docx") {
      hash = await processDocxFile(drive, driveFile, localPath, `${drivePath}/${driveFile.name}`);
    } else if (fileType === "pdf") {
      hash = await processPdfFile(drive, driveFile, localPath, `${drivePath}/${driveFile.name}`);
    } else if (fileType === "txt" || fileType === "md") {
      hash = await processTextFile(drive, driveFile, localPath, `${drivePath}/${driveFile.name}`);
    }

    if (hash) {
      manifest.driveItems[driveFile.id] = {
        name: driveFile.name,
        mimeType: driveFile.mimeType,
        modifiedTime: driveFile.modifiedTime,
        localPath: relativePath,
        hash: hash,
        drivePath: `${drivePath}/${driveFile.name}`,
        syncedAt: new Date().toISOString()
      };
      if (DRY_RUN) {
        console.log(`    → [DRY-RUN] Would save to ${relativePath}`);
      } else {
        console.log(`    → Saved to ${relativePath}`);
      }
    }
  } catch (err) {
    console.error(`    ✗ Error processing ${driveFile.name}:`, err.message);
    STATS.error++;
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  try {
    console.log("Pastor Kal Google Drive Sermon Sync");
    console.log("====================================\n");
    
    if (DRY_RUN) {
      console.log("MODE: DRY-RUN (no files written, manifest not updated)\n");
    }

    validateEnv();
    console.log("✓ Google Drive credentials validated\n");

    // Setup auth and drive API
    const auth = await createAuthClient();
    const drive = google.drive({ version: "v3", auth });

    // Ensure output directory exists (even in dry-run, for planning)
    if (!DRY_RUN) {
      await fsp.mkdir(OUTPUT_DIR, { recursive: true });
    }

    // Load existing manifest
    const manifest = await loadManifest();
    console.log(`Loaded manifest with ${Object.keys(manifest.driveItems).length} tracked items\n`);

    // Get the Bible folder
    const bibleFolderId = process.env.GOOGLE_DRIVE_BIBLE_FOLDER_ID;
    console.log(`Bible folder ID: ${bibleFolderId}`);

    // Start sync
    if (DRY_RUN) {
      console.log("\nScanning approved folders (DRY-RUN: no changes will be made)...");
    } else {
      console.log("\nStarting sync of approved folders...");
    }
    
    await syncFolderApprovedRootOnly(drive, bibleFolderId, "Bible", OUTPUT_DIR, manifest, "");

    // Save updated manifest (only in real mode)
    if (!DRY_RUN) {
      manifest.lastSyncTime = new Date().toISOString();
      await saveManifest(manifest);
    }

    console.log("\n" + "=".repeat(50));
    console.log("Sync Summary:");
    console.log("=".repeat(50));
    console.log(`New files:       ${STATS.new}`);
    console.log(`Updated files:   ${STATS.updated}`);
    console.log(`Unchanged files: ${STATS.unchanged}`);
    console.log(`Skipped items:   ${STATS.skipped}`);
    console.log(`Errors:          ${STATS.error}`);
    
    if (DRY_RUN) {
      console.log("\n✓ DRY-RUN complete (nothing was written)");
      console.log(`Total items that WOULD be synced: ${STATS.new + STATS.updated}`);
    } else {
      console.log("\n✓ Sync complete");
      console.log(`  Tracked items: ${Object.keys(manifest.driveItems).length}`);
      console.log(`  Last sync: ${manifest.lastSyncTime}`);
      console.log("\nNext step: npm run kb:sync");
    }
  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
  }
}

main();
