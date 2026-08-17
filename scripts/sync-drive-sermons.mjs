import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { google } from "googleapis";

// ============================================================================
// GOOGLE DRIVE SERMON SYNC
// Syncs approved teaching folders from Google Drive into knowledge/sources/sermons/
// Tracks changes via knowledge/drive-sync-manifest.json
// ============================================================================

const APPROVED_FOLDERS = [
  "2024",
  "2025",
  "2026",
  "Favourite Sermons",
  "Natural Law",
  "End Times",
  "Devotional",
  "Bible Studies"
];

const SUPPORTED_TYPES = {
  "application/vnd.google-apps.document": "google_doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/markdown": "md"
};

const OUTPUT_DIR = "knowledge/sources/sermons";
const MANIFEST_PATH = "knowledge/drive-sync-manifest.json";

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

async function processGoogleDoc(drive, driveFile, localPath) {
  console.log(`  Exporting Google Doc: ${driveFile.name}`);
  const content = await exportGoogleDoc(drive, driveFile.id, driveFile.name);
  
  if (!content) return null;

  const metadata = createFileMetadata(driveFile, "Google Doc");
  const fullContent = `${metadata}\n\n${content}`;
  
  await fsp.mkdir(path.dirname(localPath), { recursive: true });
  await fsp.writeFile(localPath, fullContent, "utf8");
  
  return computeFileHash(fullContent);
}

async function processDocxFile(drive, driveFile, localPath) {
  console.log(`  Processing DOCX: ${driveFile.name}`);
  
  // For now, we'll download DOCX as-is since text extraction requires additional dependencies
  // In production, you might use 'docx-parser' or 'mammoth' library
  const stream = await downloadFile(drive, driveFile.id, driveFile.name);
  if (!stream) return null;

  await fsp.mkdir(path.dirname(localPath), { recursive: true });
  
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(localPath);
    stream.pipe(writeStream);
    writeStream.on("finish", async () => {
      const data = await fsp.readFile(localPath);
      resolve(computeFileHash(data));
    });
    writeStream.on("error", (err) => {
      console.error(`Error writing DOCX file:`, err.message);
      reject(err);
    });
  });
}

async function processPdfFile(drive, driveFile, localPath) {
  console.log(`  Downloading PDF: ${driveFile.name}`);
  const stream = await downloadFile(drive, driveFile.id, driveFile.name);
  if (!stream) return null;

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
}

async function processTextFile(drive, driveFile, localPath) {
  console.log(`  Downloading text file: ${driveFile.name}`);
  const stream = await downloadFile(drive, driveFile.id, driveFile.name);
  if (!stream) return null;

  await fsp.mkdir(path.dirname(localPath), { recursive: true });
  
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(localPath);
    stream.pipe(writeStream);
    writeStream.on("finish", async () => {
      const data = await fsp.readFile(localPath, "utf8");
      const metadata = createFileMetadata(driveFile, "Text file");
      const fullContent = `${metadata}\n\n${data}`;
      await fsp.writeFile(localPath, fullContent, "utf8");
      resolve(computeFileHash(fullContent));
    });
    writeStream.on("error", (err) => {
      console.error(`Error writing text file:`, err.message);
      reject(err);
    });
  });
}

function createFileMetadata(driveFile, sourceType) {
  return `# ${driveFile.name}

**Source Type:** ${sourceType}
**Google Drive File ID:** ${driveFile.id}
**Last Modified:** ${driveFile.modifiedTime || "Unknown"}
**Category:** Pastor Kal Sermon/Teaching

---
`;
}

// ============================================================================
// Recursive Sync
// ============================================================================

async function syncFolder(drive, folderId, folderPath, localBasePath, manifest, parentPath = "") {
  console.log(`\nScanning: ${parentPath || "/"}`);
  
  const items = await listDriveFolderContents(drive, folderId, new Set(APPROVED_FOLDERS));
  const folders = items.filter(f => f.mimeType === "application/vnd.google-apps.folder");
  const files = items.filter(f => f.mimeType !== "application/vnd.google-apps.folder");

  // Process files in this folder
  for (const driveFile of files) {
    const fileType = SUPPORTED_TYPES[driveFile.mimeType];
    if (!fileType) {
      console.log(`  ⊘ Skipping unsupported: ${driveFile.name} (${driveFile.mimeType})`);
      continue;
    }

    const ext = fileType === "google_doc" ? ".md" : 
                fileType === "docx" ? ".docx" :
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
      continue;
    }

    console.log(`  ↓ Syncing: ${driveFile.name}`);
    let hash = null;

    try {
      if (fileType === "google_doc") {
        hash = await processGoogleDoc(drive, driveFile, localPath);
      } else if (fileType === "docx") {
        hash = await processDocxFile(drive, driveFile, localPath);
      } else if (fileType === "pdf") {
        hash = await processPdfFile(drive, driveFile, localPath);
      } else if (fileType === "txt" || fileType === "md") {
        hash = await processTextFile(drive, driveFile, localPath);
      }

      if (hash) {
        manifest.driveItems[driveFile.id] = {
          name: driveFile.name,
          mimeType: driveFile.mimeType,
          modifiedTime: driveFile.modifiedTime,
          localPath: relativePath,
          hash: hash,
          syncedAt: new Date().toISOString()
        };
        console.log(`    → Saved to ${relativePath}`);
      }
    } catch (err) {
      console.error(`    ✗ Error processing ${driveFile.name}:`, err.message);
    }
  }

  // Recursively process subfolders (only approved ones)
  for (const folder of folders) {
    if (!APPROVED_FOLDERS.includes(folder.name)) {
      console.log(`  ⊘ Skipping unapproved folder: ${folder.name}`);
      continue;
    }

    const subLocalPath = path.join(localBasePath, sanitizeFileName(folder.name));
    await syncFolder(drive, folder.id, folder.id, subLocalPath, manifest, 
                    parentPath ? `${parentPath}/${folder.name}` : folder.name);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  try {
    console.log("Pastor Kal Google Drive Sermon Sync");
    console.log("====================================\n");

    validateEnv();
    console.log("✓ Google Drive credentials validated\n");

    // Setup auth and drive API
    const auth = await createAuthClient();
    const drive = google.drive({ version: "v3", auth });

    // Ensure output directory exists
    await fsp.mkdir(OUTPUT_DIR, { recursive: true });

    // Load existing manifest
    const manifest = await loadManifest();
    console.log(`Loaded manifest with ${Object.keys(manifest.driveItems).length} tracked items\n`);

    // Get the Bible folder
    const bibleFolderId = process.env.GOOGLE_DRIVE_BIBLE_FOLDER_ID;
    console.log(`Bible folder ID: ${bibleFolderId}`);

    // Start sync
    console.log("\nStarting sync of approved folders...");
    await syncFolder(drive, bibleFolderId, bibleFolderId, OUTPUT_DIR, manifest, "Bible");

    // Save updated manifest
    manifest.lastSyncTime = new Date().toISOString();
    await saveManifest(manifest);

    console.log("\n✓ Sync complete");
    console.log(`  Tracked items: ${Object.keys(manifest.driveItems).length}`);
    console.log(`  Last sync: ${manifest.lastSyncTime}`);
    console.log("\nNext step: npm run kb:sync");
  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
  }
}

main();
