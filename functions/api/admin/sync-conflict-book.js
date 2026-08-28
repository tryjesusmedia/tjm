const OPENAI_API = "https://api.openai.com/v1";

const books = {
  PP: { filename: "01-patriarchs-and-prophets.pdf", title: "Patriarchs and Prophets", url: "https://media2.egwwritings.org/pdf/en_PP.pdf" },
  PK: { filename: "02-prophets-and-kings.pdf", title: "Prophets and Kings", url: "https://media2.egwwritings.org/pdf/en_PK.pdf" },
  DA: { filename: "03-the-desire-of-ages.pdf", title: "The Desire of Ages", url: "https://media2.egwwritings.org/pdf/en_DA.pdf" },
  AA: { filename: "04-the-acts-of-the-apostles.pdf", title: "The Acts of the Apostles", url: "https://media2.egwwritings.org/pdf/en_AA.pdf" },
  GC: { filename: "05-the-great-controversy.pdf", title: "The Great Controversy", url: "https://media2.egwwritings.org/pdf/en_GC.pdf" },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function openAI(env, path, init = {}) {
  const response = await fetch(`${OPENAI_API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `OpenAI request failed (${response.status})`);
  return payload;
}

async function existingByFilename(env, filename) {
  const listing = await openAI(env, `/vector_stores/${env.OPENAI_VECTOR_STORE_ID}/files?limit=100`);
  const metadata = await Promise.all((listing.data || []).map(async (item) => {
    const file = await openAI(env, `/files/${item.id}`);
    return { ...item, filename: file.filename };
  }));
  return metadata.find((item) => item.filename === filename) || null;
}

async function sha256(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost({ env, request }) {
  if (!env.KB_SYNC_TOKEN || request.headers.get("x-kb-sync-token") !== env.KB_SYNC_TOKEN) {
    return json({ error: "Not found" }, 404);
  }
  if (!env.OPENAI_API_KEY || !env.OPENAI_VECTOR_STORE_ID) {
    return json({ error: "Knowledge service is not configured" }, 503);
  }

  const code = new URL(request.url).searchParams.get("code")?.toUpperCase();
  const book = code ? books[code] : null;
  if (!book) return json({ error: "Choose one of PP, PK, DA, AA, or GC" }, 400);

  try {
    const existing = await existingByFilename(env, book.filename);
    if (existing) return json({ code, filename: book.filename, fileId: existing.id, status: existing.status, skipped: true });

    const source = await fetch(book.url, { headers: { "user-agent": "TryJesusMediaKnowledgeSync/1.0" } });
    if (!source.ok) throw new Error(`Official PDF download failed (${source.status})`);
    const buffer = await source.arrayBuffer();
    if (buffer.byteLength < 500_000 || new TextDecoder().decode(buffer.slice(0, 5)) !== "%PDF-") {
      throw new Error("Official source did not return a complete PDF");
    }

    const form = new FormData();
    form.append("purpose", "assistants");
    form.append("file", new Blob([buffer], { type: "application/pdf" }), book.filename);
    const uploaded = await openAI(env, "/files", { method: "POST", body: form });
    let attached = await openAI(env, `/vector_stores/${env.OPENAI_VECTOR_STORE_ID}/files`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        file_id: uploaded.id,
        attributes: { collection: "conflict-of-the-ages", code, title: book.title, authority: 5 },
      }),
    });

    for (let attempt = 0; attempt < 18 && (attached.status === "in_progress" || attached.status === "queued"); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attached = await openAI(env, `/vector_stores/${env.OPENAI_VECTOR_STORE_ID}/files/${uploaded.id}`);
    }

    return json({
      code,
      filename: book.filename,
      fileId: uploaded.id,
      status: attached.status,
      bytes: buffer.byteLength,
      sha256: await sha256(buffer),
      skipped: false,
    });
  } catch (error) {
    console.error("Conflict knowledge sync failed", code, error);
    return json({ error: error instanceof Error ? error.message : "Knowledge sync failed" }, 500);
  }
}

export function onRequest() {
  return json({ error: "Not found" }, 404);
}
