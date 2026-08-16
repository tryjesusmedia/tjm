import { PASTOR_KAL_SYSTEM } from "../../lib/pastor-kal-prompt.js";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_MESSAGE_CHARS = 6000;
const MAX_HISTORY_ITEMS = 14;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}


function isAllowedWelcomeRequest(request) {
  const referer = request.headers.get("referer");
  if (!referer) return false;

  try {
    const url = new URL(referer);
    const isWelcomePath = url.pathname === "/welcome" || url.pathname === "/welcome/";
    const isProductionHost = url.hostname === "tryjesusmedia.com" || url.hostname === "www.tryjesusmedia.com";
    const isLocalPreview = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return isWelcomePath && (isProductionHost || isLocalPreview);
  } catch {
    return false;
  }
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-MAX_HISTORY_ITEMS)
    .filter((item) => item && (item.role === "user" || item.role === "assistant"))
    .map((item) => ({
      role: item.role,
      content: String(item.content || "").slice(0, MAX_MESSAGE_CHARS),
    }))
    .filter((item) => item.content.trim().length > 0);
}

function extractOutputText(payload) {
  const chunks = [];
  for (const item of payload?.output || []) {
    if (item?.type !== "message") continue;
    for (const part of item?.content || []) {
      if (part?.type === "output_text" && typeof part.text === "string") {
        chunks.push(part.text);
      }
    }
  }
  return chunks.join("\n").trim();
}

function extractFileSources(payload) {
  const names = new Set();
  for (const item of payload?.output || []) {
    if (item?.type !== "file_search_call") continue;
    for (const result of item?.results || []) {
      const filename = result?.filename || result?.file_name;
      if (filename) names.add(filename);
    }
  }
  return [...names].slice(0, 6);
}

export async function onRequestPost(context) {
  try {
    const { env, request } = context;

    if (!env.OPENAI_API_KEY) {
      return json({ error: "Server is missing OPENAI_API_KEY." }, 500);
    }

    if (!isAllowedWelcomeRequest(request)) {
      return json({ error: "Pastor Kal is available only on tryjesusmedia.com/welcome." }, 403);
    }

    const body = await request.json().catch(() => null);
    const message = String(body?.message || "").trim();
    if (!message) return json({ error: "Please enter a question." }, 400);
    if (message.length > MAX_MESSAGE_CHARS) {
      return json({ error: "That message is too long. Please shorten it and try again." }, 413);
    }

    const history = normalizeHistory(body?.history);
    const input = [...history, { role: "user", content: message }];

    const requestBody = {
      model: env.OPENAI_MODEL || "gpt-5.6",
      instructions: PASTOR_KAL_SYSTEM,
      input,
      store: false,
      moderation: { model: "omni-moderation-latest" },
    };

    if (env.OPENAI_VECTOR_STORE_ID) {
      requestBody.tools = [
        {
          type: "file_search",
          vector_store_ids: [env.OPENAI_VECTOR_STORE_ID],
          max_num_results: 10,
        },
      ];
      requestBody.include = ["file_search_call.results"];
      requestBody.tool_choice = "required";
    }

    const openAIResponse = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const payload = await openAIResponse.json().catch(() => ({}));

    if (!openAIResponse.ok) {
      console.error("OpenAI error", openAIResponse.status, payload);
      return json(
        { error: "Pastor Kal could not answer that right now. Please try again." },
        openAIResponse.status >= 500 ? 502 : 400,
      );
    }

    const answer = extractOutputText(payload);
    if (!answer) {
      return json({ error: "No answer was generated. Please try rephrasing your question." }, 502);
    }

    return json({
      answer,
      sources: extractFileSources(payload),
      knowledgeConnected: Boolean(env.OPENAI_VECTOR_STORE_ID),
    });
  } catch (error) {
    console.error(error);
    return json({ error: "Something went wrong while answering. Please try again." }, 500);
  }
}

export function onRequest() {
  return json({ error: "Method not allowed." }, 405);
}
