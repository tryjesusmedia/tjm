import OpenAI from "openai";
import { PASTOR_KAL_SYSTEM } from "../lib/pastor-kal-prompt.js";

const client = new OpenAI();
const vectorStoreId = process.env.OPENAI_VECTOR_STORE_ID;
if (!vectorStoreId) throw new Error("Set OPENAI_VECTOR_STORE_ID first.");

const question = process.argv.slice(2).join(" ") || "Why does God allow suffering?";
const response = await client.responses.create({
  model: process.env.OPENAI_MODEL || "gpt-5.6",
  instructions: PASTOR_KAL_SYSTEM,
  input: question,
  tools: [{ type: "file_search", vector_store_ids: [vectorStoreId], max_num_results: 10 }],
  include: ["file_search_call.results"],
  tool_choice: "required",
  moderation: { model: "omni-moderation-latest" },
  store: false,
});

console.log(response.output_text);
