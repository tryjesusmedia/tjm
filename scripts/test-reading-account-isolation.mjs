import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function config(path, key) {
  const context = { window: {}, document: { write() {} } };
  vm.runInNewContext(readFileSync(new URL(path, import.meta.url), 'utf8'), context);
  return context.window[key];
}
const chron = config('../chronbible/config.js', 'TJM_CHRONBIBLE_CONFIG');
const conflict = config('../bibleandconflictoftheages/config.js', 'TJM_CONFLICT_CONFIG');
assert.equal(new URL(chron.supabaseUrl).hostname, 'erejehmrtzjpqurbftsm.supabase.co', 'Preserve the established ChronBible backend');
assert.equal(new URL(conflict.supabaseUrl).hostname, 'gabufylczphhykudwzbc.supabase.co');
assert.notEqual(conflict.supabaseUrl, chron.supabaseUrl, 'Separate browser keys alone do not isolate accounts');
assert.notEqual(conflict.supabasePublishableKey, chron.supabasePublishableKey);
assert.notEqual(conflict.authStorageKey, 'sb-erejehmrtzjpqurbftsm-auth-token');
assert.ok(conflict.authStorageKey);
const runtime = readFileSync(new URL('../bibleandconflictoftheages/app.js', import.meta.url), 'utf8');
assert.match(runtime, /storageKey: CONFIG\.authStorageKey/);
assert.match(runtime, /signOut\(\{ scope: "local" \}\)/);
console.log('Website account separation and existing ChronBible backend contract passed.');
