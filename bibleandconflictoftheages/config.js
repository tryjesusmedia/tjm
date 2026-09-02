window.TJM_CONFLICT_CONFIG = Object.freeze({
  appName: "The Bible & Conflict of the Ages Journey",
  planId: "bible-conflict-ages-v1",
  siteUrl: "https://tryjesusmedia.com/bibleandconflictoftheages/",
  supabaseUrl: "https://erejehmrtzjpqurbftsm.supabase.co",
  supabasePublishableKey: "sb_publishable_bOxmjg6RWmwfw7i7o_YhTg_zOjUt0p6",
});

// Install the Mind Map gesture layer before the shared Principles handlers.
// It owns pan/zoom/freeform movement so drag releases cannot fall through to reading navigation.
document.write('<link rel="stylesheet" href="../lib/principles-mindmap-v2.css?v=20260902-3">');
document.write('<link rel="stylesheet" href="../lib/principles-mindmap-v3.css?v=20260902-1">');
document.write('<script src="../lib/principles-mindmap-v3.js?v=20260902-2"><\/script>');
