window.TJM_CHRONBIBLE_CONFIG = Object.freeze({
  appName: "The Bible in Chronological Order",
  planId: "chronological-bible-doc-v5",
  // Keep PKCE callbacks on this specific review preview; all other hosts use production.
  siteUrl: window.location?.origin === "https://feat-chronbible-apple-email.tjm-eln.pages.dev"
    ? "https://feat-chronbible-apple-email.tjm-eln.pages.dev/chronbible/"
    : "https://tryjesusmedia.com/chronbible/",
  supabaseUrl: "https://erejehmrtzjpqurbftsm.supabase.co",
  supabasePublishableKey: "sb_publishable_bOxmjg6RWmwfw7i7o_YhTg_zOjUt0p6",
});
