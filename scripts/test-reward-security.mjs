import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = await readFile(new URL("../bibleandconflictoftheages/config.js", import.meta.url), "utf8");
const supabaseUrl = config.match(/supabaseUrl:\s*"([^"]+)"/)?.[1];
const publishableKey = config.match(/supabasePublishableKey:\s*"([^"]+)"/)?.[1];

assert.ok(supabaseUrl, "Supabase URL is required");
assert.ok(publishableKey, "Supabase publishable key is required");

const checks = [
  ["private first-name RPC", "/rest/v1/rpc/get_my_journey_first_name", "POST", {}],
  ["custom leaderboard-name RPC", "/rest/v1/rpc/update_journey_alias", "POST", { p_alias: "Anonymous Reader" }],
  ["conflict leaderboard RPC", "/rest/v1/rpc/get_conflict_journey_leaderboard", "POST", {}],
  ["private reward-profile table", "/rest/v1/journey_reward_profiles?select=first_name&limit=1", "GET", null],
];

for (const [label, path, method, payload] of checks) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: publishableKey,
      "Content-Type": "application/json",
    },
    body: method === "POST" ? JSON.stringify(payload) : undefined,
  });
  assert.ok(response.status >= 400, `${label} must reject anonymous access`);
  console.log(`${label}: anonymous access rejected (${response.status})`);
}
