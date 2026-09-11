(() => {
  "use strict";

  const config = window.TJM_CHRONBIBLE_CONFIG;
  const mount = document.getElementById("reader-mount");
  const input = document.getElementById("passage-input");
  const signIn = document.getElementById("reader-sign-in");
  const signOut = document.getElementById("reader-sign-out");
  const syncStatus = document.getElementById("reader-sync-status");
  const toastElement = document.getElementById("reader-toast");
  let db = null;
  let session = null;
  let toastTimer = null;
  let refreshTimer = null;

  function toast(message) {
    clearTimeout(toastTimer);
    toastElement.textContent = message;
    toastElement.classList.add("is-visible");
    toastTimer = setTimeout(() => toastElement.classList.remove("is-visible"), 3000);
  }

  function currentReference() {
    return new URLSearchParams(location.search).get("reference")?.trim() || "John 3:16-17";
  }

  function open(reference, replace = false) {
    const clean = reference.trim();
    if (!clean) return;
    input.value = clean;
    const nextUrl = new URL(location.href);
    nextUrl.searchParams.set("reference", clean);
    history[replace ? "replaceState" : "pushState"]({}, "", nextUrl);
    window.TJMNativeBible.openPassage(mount, clean, {
      planId: "bible-guides",
      readingId: `guide:${clean.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`,
    });
  }

  async function applySession(nextSession) {
    session = nextSession;
    clearInterval(refreshTimer);
    signIn.hidden = Boolean(session);
    signOut.hidden = !session;
    syncStatus.textContent = session ? "Highlights and notes are synced" : "Notes stay on this device";
    await window.TJMNativeBible.syncHighlights();
    if (session) refreshTimer = setInterval(() => {
      if (document.visibilityState === "visible") window.TJMNativeBible.syncHighlights();
    }, 60000);
  }

  document.getElementById("passage-form").addEventListener("submit", (event) => {
    event.preventDefault();
    open(input.value);
  });
  document.getElementById("reader-back").addEventListener("click", () => {
    if (history.length > 1) history.back();
    else location.href = "/welcome/#bible-guides";
  });
  window.addEventListener("popstate", () => open(currentReference(), true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && session) window.TJMNativeBible.syncHighlights();
  });
  signIn.addEventListener("click", async () => {
    if (!db?.auth) {
      toast("Account sync is temporarily unavailable. Your notes will remain on this device.");
      return;
    }
    const { error } = await db.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.href } });
    if (error) toast(error.message);
  });
  signOut.addEventListener("click", () => db?.auth?.signOut());

  async function init() {
    window.TJMNativeBible.configure({ getDb: () => db, getSession: () => session, toast, planId: "bible-guides" });
    open(currentReference(), true);
    if (!window.supabase?.createClient) return;
    db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
    });
    const { data } = await db.auth.getSession();
    await applySession(data.session);
    db.auth.onAuthStateChange((_event, nextSession) => setTimeout(() => applySession(nextSession), 0));
  }

  init();
})();
