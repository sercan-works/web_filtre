// URL parametrelerinden engelleme bilgilerini oku ve goster
const params = new URLSearchParams(window.location.search);

const url = params.get("url") || "Bilinmiyor";
const reason = params.get("reason") || "url";
const match = params.get("match") || "Bilinmiyor";

document.getElementById("blockedUrl").textContent = decodeURIComponent(url);
document.getElementById("blockedMatch").textContent = decodeURIComponent(match);

const reasonText = reason === "keyword"
  ? "Anahtar kelime tespit edildi"
  : "URL filtresi eslesmesi";

document.getElementById("blockedReason").textContent = reasonText;

// Engelleme sayfasi gosterildiginde de ihlal bildir (page modu icin)
chrome.runtime.sendMessage({
  action: "reportViolation",
  url: decodeURIComponent(url),
  reason: reason,
  match: decodeURIComponent(match)
});
