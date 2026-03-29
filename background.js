// ATLANTIS - Service Worker (Background Script)

// --- Istemci kimlik yonetimi ---
async function getClientInfo() {
  const data = await chrome.storage.local.get(["clientId", "clientName"]);
  let clientId = data.clientId;
  if (!clientId) {
    clientId = "client_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8);
    await chrome.storage.local.set({ clientId });
  }
  return { clientId, clientName: data.clientName || "Isimsiz" };
}

// Varsayilan storage yapisini olustur
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(null, (data) => {
    if (data.extensionEnabled === undefined) {
      chrome.storage.local.set({
        extensionEnabled: true,
        passwordHash: null,
        urlFilters: [],
        keywordFilters: [],
        blockAction: "page",
        redirectUrl: "",
        serverUrl: "",
        syncMode: "local",
        clientName: ""
      });
    }
  });
});

// Kullanici pattern'ini declarativeNetRequest urlFilter formatina cevir
function convertPattern(pattern) {
  pattern = pattern.trim().toLowerCase();
  if (pattern.startsWith("*") || pattern.startsWith("||")) return pattern;
  if (pattern.startsWith("*.")) return "||" + pattern.substring(2);
  return "||" + pattern;
}

// Engelleme URL'sini olustur
function buildBlockUrl(blockAction, redirectUrl, originalUrl, reason, match) {
  if (blockAction === "redirect" && redirectUrl) return redirectUrl;
  return chrome.runtime.getURL("blocked/blocked.html") +
    "?url=" + encodeURIComponent(originalUrl) +
    "&reason=" + encodeURIComponent(reason) +
    "&match=" + encodeURIComponent(match);
}

// Aktif URL pattern'leri (ihlal tespiti icin)
let activeUrlPatterns = [];

// URL filtreleme kurallarini senkronize et
async function syncUrlRules() {
  const data = await chrome.storage.local.get(["urlFilters", "extensionEnabled", "blockAction", "redirectUrl"]);
  const urlFilters = data.urlFilters || [];
  const enabled = data.extensionEnabled !== false;
  const blockAction = data.blockAction || "page";
  const redirectUrl = data.redirectUrl || "";

  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existingRules.map(r => r.id);

  if (!enabled || urlFilters.length === 0) {
    activeUrlPatterns = [];
    if (removeRuleIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: [] });
    }
    return;
  }

  // Pattern'leri kaydet (ihlal tespiti icin)
  activeUrlPatterns = urlFilters.map(f => f.pattern.toLowerCase());

  const addRules = urlFilters.map((filter, index) => ({
    id: index + 1,
    priority: 1,
    action: { type: "redirect", redirect: { url: buildBlockUrl(blockAction, redirectUrl, filter.pattern, "url", filter.pattern) } },
    condition: { urlFilter: convertPattern(filter.pattern), resourceTypes: ["main_frame"] }
  }));

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
}

// Redirect modunda ihlal tespiti: declarativeNetRequest yonlendirme yaptiktan sonra
// hedef URL'e (orn. google.com) gidis webNavigation'da yakalanir.
// Bunun yerine, onBeforeNavigate'te engellenen URL'yi yakalayip bildiriyoruz.
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  if (activeUrlPatterns.length === 0) return;

  const navUrl = details.url.toLowerCase();
  for (const pattern of activeUrlPatterns) {
    const check = pattern.replace(/^\*\.?/, "").replace(/\*/g, "");
    if (check && navUrl.includes(check)) {
      reportViolation(details.url, "url", pattern, "");
      return;
    }
  }
});

// --- Sunucuya ihlal bildirimi gonder ---
async function reportViolation(url, reason, match, pageTitle) {
  const config = await chrome.storage.local.get(["serverUrl"]);
  if (!config.serverUrl) return;

  const client = await getClientInfo();
  try {
    const endpoint = config.serverUrl.replace(/\/+$/, "") + "/api/logs";
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: client.clientId,
        clientName: client.clientName,
        url, reason, match, pageTitle
      }),
      signal: AbortSignal.timeout(5000)
    });
  } catch (e) {
    console.warn("ATLANTIS: Ihlal bildirimi gonderilemedi:", e.message);
  }
}

// --- Trafik toplama ve toplu gonderim ---
let trafficBuffer = [];

async function flushTraffic() {
  const config = await chrome.storage.local.get(["serverUrl"]);
  if (!config.serverUrl || trafficBuffer.length === 0) return;

  const client = await getClientInfo();
  const entries = trafficBuffer.splice(0); // buffer'i temizle

  try {
    const endpoint = config.serverUrl.replace(/\/+$/, "") + "/api/traffic";
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: client.clientId,
        clientName: client.clientName,
        entries
      }),
      signal: AbortSignal.timeout(5000)
    });
  } catch (e) {
    // Gonderilemezse buffer'a geri koy (maks 500)
    trafficBuffer.unshift(...entries);
    if (trafficBuffer.length > 500) trafficBuffer.length = 500;
    console.warn("ATLANTIS: Trafik gonderilemedi:", e.message);
  }
}

// Sayfa navigasyonlarini izle (ag trafigi)
chrome.webNavigation.onCompleted.addListener((details) => {
  // Sadece ana frame (sayfalar), sub-frame degil
  if (details.frameId !== 0) return;
  // Extension kendi sayfalari haric
  if (details.url.startsWith("chrome-extension://") || details.url.startsWith("chrome://")) return;

  trafficBuffer.push({
    url: details.url,
    title: "",
    timestamp: Date.now()
  });

  // Sayfa basligini almaya calis
  chrome.tabs.get(details.tabId, (tab) => {
    if (chrome.runtime.lastError) return;
    const last = trafficBuffer[trafficBuffer.length - 1];
    if (last && last.url === details.url) {
      last.title = tab.title || "";
    }
  });
});

// --- Sunucudan kural cekme ---
async function syncFromServer() {
  const config = await chrome.storage.local.get(["serverUrl", "syncMode"]);
  if (config.syncMode !== "server" || !config.serverUrl) return;

  try {
    const url = config.serverUrl.replace(/\/+$/, "") + "/api/rules";
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) { console.warn("ATLANTIS: Sunucu yanit vermedi:", response.status); return; }

    const rules = await response.json();
    await chrome.storage.local.set({
      urlFilters: rules.urlFilters || [],
      keywordFilters: rules.keywordFilters || [],
      blockAction: rules.blockAction || "page",
      redirectUrl: rules.redirectUrl || "",
      extensionEnabled: rules.extensionEnabled !== false,
      lastSync: Date.now()
    });

    console.log("ATLANTIS: Senkronize edildi -", (rules.urlFilters || []).length, "URL,", (rules.keywordFilters || []).length, "kelime");
  } catch (e) {
    console.warn("ATLANTIS: Sunucu baglantisi basarisiz:", e.message);
  }
}

// Periyodik alarm: kural senkronizasyonu + trafik flush
chrome.alarms.create("atlantis-sync", { periodInMinutes: 0.5 });
chrome.alarms.create("atlantis-traffic-flush", { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "atlantis-sync") syncFromServer();
  if (alarm.name === "atlantis-traffic-flush") flushTraffic();
});

// Storage degisikliklerini dinle
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.urlFilters || changes.extensionEnabled || changes.blockAction || changes.redirectUrl) syncUrlRules();
  if (changes.serverUrl || changes.syncMode) syncFromServer();
});

// Baslangiçta senkronize et
syncUrlRules();
syncFromServer();

// Content script'ten ve popup'tan gelen mesajlari dinle
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "keywordBlocked" && sender.tab) {
    chrome.storage.local.get(["blockAction", "redirectUrl"], (data) => {
      const blockAction = data.blockAction || "page";
      const redirectUrl = data.redirectUrl || "";
      const targetUrl = buildBlockUrl(blockAction, redirectUrl, message.url, "keyword", message.keyword);
      chrome.tabs.update(sender.tab.id, { url: targetUrl });

      // Ihlal bildir
      reportViolation(message.url, "keyword", message.keyword, "");
    });
    sendResponse({ success: true });
  }

  // Blocked sayfasindan ihlal bildirimi
  if (message.action === "reportViolation") {
    reportViolation(message.url, message.reason, message.match, "");
    sendResponse({ success: true });
  }

  if (message.action === "forceSync") {
    syncFromServer().then(() => sendResponse({ success: true }));
    return true;
  }

  return true;
});
