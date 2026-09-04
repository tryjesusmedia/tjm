window.TJM_CONFLICT_CONFIG = Object.freeze({
  appName: "The Bible & Conflict of the Ages Journey",
  planId: "bible-conflict-ages-v1",
  siteUrl: "https://tryjesusmedia.com/bibleandconflictoftheages/",
  supabaseUrl: "https://erejehmrtzjpqurbftsm.supabase.co",
  supabasePublishableKey: "sb_publishable_bOxmjg6RWmwfw7i7o_YhTg_zOjUt0p6",
});

// The Folder Mind Map is progressively enhanced over the existing Principles
// controller. The legacy Principles view remains a fallback if the module/CDN
// cannot load.
document.write('<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xyflow/react@12.11.3/dist/style.css">');
document.write('<link rel="stylesheet" href="../lib/principles-folders-flow.css?v=20260904-1">');
document.write('<script defer src="../lib/principles-react-flow-bridge.js?v=20260903-2"><\/script>');
document.write('<script type="module" src="../lib/principles-folders-flow.mjs?v=20260904-3"><\/script>');
