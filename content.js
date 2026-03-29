// Web Filtre - Content Script (Kelime Filtreleme)

(async function () {
  // Extension ve admin sayfalarini taramaktan kacin
  if (location.href.startsWith("chrome-extension://")) return;

  const data = await chrome.storage.local.get(["keywordFilters", "extensionEnabled", "serverUrl"]);

  // Sunucu admin sayfasini tara disi birak
  if (data.serverUrl) {
    const serverOrigin = new URL(data.serverUrl).origin;
    if (location.href.startsWith(serverOrigin)) return;
  }
  const enabled = data.extensionEnabled !== false;
  const keywords = data.keywordFilters || [];

  if (!enabled || keywords.length === 0) return;

  // Regex ozel karakterlerini escape et
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function scanPage() {
    const text = document.body ? document.body.innerText : "";
    if (!text) return;

    // Performans icin maks 500.000 karakter tara
    const sample = text.substring(0, 500000).toLowerCase();

    for (const entry of keywords) {
      const kw = entry.keyword.toLowerCase();
      if (sample.includes(kw)) {
        chrome.runtime.sendMessage({
          action: "keywordBlocked",
          url: location.href,
          keyword: entry.keyword
        });
        return; // Ilk eslesmede dur
      }
    }
  }

  // Sayfa yuklendiginde tara
  scanPage();

  // SPA'lar icin DOM degisikliklerini izle (debounce ile)
  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(scanPage, 1500);
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
