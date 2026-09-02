window.TJM_CONFLICT_CONFIG = Object.freeze({
  appName: "The Bible & Conflict of the Ages Journey",
  planId: "bible-conflict-ages-v1",
  siteUrl: "https://tryjesusmedia.com/bibleandconflictoftheages/",
  supabaseUrl: "https://erejehmrtzjpqurbftsm.supabase.co",
  supabasePublishableKey: "sb_publishable_bOxmjg6RWmwfw7i7o_YhTg_zOjUt0p6",
});

// Load the focused-group arena before the general Principles drag handlers so
// group cards can manage their own press/drag/pan gestures without becoming sticky.
document.write('<link rel="stylesheet" href="../lib/principles-group-arena.css?v=20260902-1">');
document.write('<script src="../lib/principles-group-arena.js?v=20260902-1"><\/script>');
