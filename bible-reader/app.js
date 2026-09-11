(() => {
  "use strict";

  const reference = new URLSearchParams(location.search).get("reference")?.trim() || "John 3:16-17";
  const destination = new URL("https://www.biblegateway.com/passage/");
  destination.searchParams.set("search", reference);
  destination.searchParams.set("version", "KJV");

  const fallback = document.getElementById("biblegateway-link");
  fallback.href = destination.href;
  fallback.textContent = `Read ${reference} in the KJV on BibleGateway`;
  location.replace(destination.href);
})();
