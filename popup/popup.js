// ATLANTIS - Popup Yonetim Paneli

const $ = (id) => document.getElementById(id);

// Gorunumler
const setupView = $("setupView");
const loginView = $("loginView");
const mainView = $("mainView");

// -- Baslangic: Hangi gorunumu goster? --
chrome.storage.local.get(["passwordHash"], (data) => {
  if (data.passwordHash) {
    loginView.style.display = "block";
    $("loginPass").focus();
  } else {
    setupView.style.display = "block";
    $("setupPass").focus();
  }
});

// -- Sifre Olusturma --
$("setupBtn").addEventListener("click", async () => {
  const pass = $("setupPass").value;
  const confirm = $("setupPassConfirm").value;
  const error = $("setupError");

  if (pass.length < 4) {
    error.textContent = "Sifre en az 4 karakter olmali!";
    return;
  }
  if (pass !== confirm) {
    error.textContent = "Sifreler eslesmiyor!";
    return;
  }

  const hash = await hashPassword(pass);
  chrome.storage.local.set({ passwordHash: hash }, () => {
    setupView.style.display = "none";
    showMainView();
  });
});

$("setupPassConfirm").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("setupBtn").click();
});

// -- Giris --
$("loginBtn").addEventListener("click", async () => {
  const pass = $("loginPass").value;
  const error = $("loginError");

  const data = await chrome.storage.local.get(["passwordHash"]);
  const hash = await hashPassword(pass);

  if (hash === data.passwordHash) {
    loginView.style.display = "none";
    showMainView();
  } else {
    error.textContent = "Yanlis sifre!";
    $("loginPass").value = "";
    $("loginPass").focus();
  }
});

$("loginPass").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("loginBtn").click();
});

// -- Yonetim Paneli --
function showMainView() {
  mainView.style.display = "block";
  loadFilters();
  loadToggle();
  loadBlockAction();
  loadServerSettings();
}

// Toggle acik/kapali
async function loadToggle() {
  const data = await chrome.storage.local.get(["extensionEnabled"]);
  const enabled = data.extensionEnabled !== false;
  $("toggleSwitch").checked = enabled;
  $("toggleLabel").textContent = enabled ? "Filtreleme Aktif" : "Filtreleme Pasif";
}

$("toggleSwitch").addEventListener("change", () => {
  const enabled = $("toggleSwitch").checked;
  chrome.storage.local.set({ extensionEnabled: enabled });
  $("toggleLabel").textContent = enabled ? "Filtreleme Aktif" : "Filtreleme Pasif";
});

// -- Engelleme Aksiyonu Tablari --
async function loadBlockAction() {
  const data = await chrome.storage.local.get(["blockAction", "redirectUrl"]);
  const action = data.blockAction || "page";
  const redirectUrl = data.redirectUrl || "";

  setActiveTab(action);
  $("redirectUrlInput").value = redirectUrl;
}

function setActiveTab(action) {
  $("tabBlockPage").classList.toggle("active", action === "page");
  $("tabRedirect").classList.toggle("active", action === "redirect");
  $("redirectSettings").style.display = action === "redirect" ? "block" : "none";
}

$("tabBlockPage").addEventListener("click", () => {
  setActiveTab("page");
  chrome.storage.local.set({ blockAction: "page" });
});

$("tabRedirect").addEventListener("click", () => {
  setActiveTab("redirect");
  chrome.storage.local.set({ blockAction: "redirect" });
});

$("redirectSaveBtn").addEventListener("click", () => {
  const url = $("redirectUrlInput").value.trim();
  if (!url) {
    $("redirectInfo").textContent = "URL bos olamaz!";
    $("redirectInfo").style.color = "#e74c3c";
    return;
  }
  chrome.storage.local.set({ redirectUrl: url }, () => {
    $("redirectInfo").textContent = "Kaydedildi!";
    $("redirectInfo").style.color = "#FFD700";
    setTimeout(() => { $("redirectInfo").textContent = ""; }, 2000);
  });
});

$("redirectUrlInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("redirectSaveBtn").click();
});

// Filtreleri yukle ve goster
async function loadFilters() {
  const data = await chrome.storage.local.get(["urlFilters", "keywordFilters"]);
  renderUrlFilters(data.urlFilters || []);
  renderKeywordFilters(data.keywordFilters || []);
}

// -- URL Filtreleri --
function renderUrlFilters(filters) {
  const list = $("urlList");
  const empty = $("urlEmpty");
  $("urlCount").textContent = "(" + filters.length + ")";

  list.innerHTML = "";
  if (filters.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  filters.forEach((f) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${escapeHtml(f.pattern)}</span>`;
    const btn = document.createElement("button");
    btn.className = "btn btn-del";
    btn.textContent = "Sil";
    btn.addEventListener("click", () => deleteUrlFilter(f.id));
    li.appendChild(btn);
    list.appendChild(li);
  });
}

$("urlAddBtn").addEventListener("click", addUrlFilter);
$("urlInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addUrlFilter();
});

async function addUrlFilter() {
  const input = $("urlInput");
  const pattern = input.value.trim();
  if (!pattern) return;

  const data = await chrome.storage.local.get(["urlFilters"]);
  const filters = data.urlFilters || [];

  if (filters.some(f => f.pattern === pattern)) {
    input.value = "";
    return;
  }

  filters.push({
    id: "uf_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
    pattern: pattern,
    createdAt: Date.now()
  });

  chrome.storage.local.set({ urlFilters: filters }, () => {
    input.value = "";
    renderUrlFilters(filters);
  });
}

async function deleteUrlFilter(id) {
  const data = await chrome.storage.local.get(["urlFilters"]);
  const filters = (data.urlFilters || []).filter(f => f.id !== id);
  chrome.storage.local.set({ urlFilters: filters }, () => {
    renderUrlFilters(filters);
  });
}

// -- Anahtar Kelime Filtreleri --
function renderKeywordFilters(filters) {
  const list = $("kwList");
  const empty = $("kwEmpty");
  $("kwCount").textContent = "(" + filters.length + ")";

  list.innerHTML = "";
  if (filters.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  filters.forEach((f) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${escapeHtml(f.keyword)}</span>`;
    const btn = document.createElement("button");
    btn.className = "btn btn-del";
    btn.textContent = "Sil";
    btn.addEventListener("click", () => deleteKeywordFilter(f.id));
    li.appendChild(btn);
    list.appendChild(li);
  });
}

$("kwAddBtn").addEventListener("click", addKeywordFilter);
$("kwInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addKeywordFilter();
});

async function addKeywordFilter() {
  const input = $("kwInput");
  const keyword = input.value.trim();
  if (!keyword) return;

  const data = await chrome.storage.local.get(["keywordFilters"]);
  const filters = data.keywordFilters || [];

  if (filters.some(f => f.keyword === keyword)) {
    input.value = "";
    return;
  }

  filters.push({
    id: "kf_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
    keyword: keyword,
    createdAt: Date.now()
  });

  chrome.storage.local.set({ keywordFilters: filters }, () => {
    input.value = "";
    renderKeywordFilters(filters);
  });
}

async function deleteKeywordFilter(id) {
  const data = await chrome.storage.local.get(["keywordFilters"]);
  const filters = (data.keywordFilters || []).filter(f => f.id !== id);
  chrome.storage.local.set({ keywordFilters: filters }, () => {
    renderKeywordFilters(filters);
  });
}

// -- Kilitle --
$("lockBtn").addEventListener("click", () => {
  mainView.style.display = "none";
  loginView.style.display = "block";
  $("loginPass").value = "";
  $("loginError").textContent = "";
  $("loginPass").focus();
});

// -- Sifre Degistir --
$("changePassToggle").addEventListener("click", () => {
  const form = $("changePassForm");
  form.style.display = form.style.display === "none" ? "block" : "none";
  $("changePassError").textContent = "";
  $("oldPass").value = "";
  $("newPass").value = "";
  $("newPassConfirm").value = "";
});

$("changePassBtn").addEventListener("click", async () => {
  const oldPass = $("oldPass").value;
  const newPass = $("newPass").value;
  const confirmPass = $("newPassConfirm").value;
  const error = $("changePassError");

  const data = await chrome.storage.local.get(["passwordHash"]);
  const oldHash = await hashPassword(oldPass);

  if (oldHash !== data.passwordHash) {
    error.textContent = "Mevcut sifre yanlis!";
    return;
  }
  if (newPass.length < 4) {
    error.textContent = "Yeni sifre en az 4 karakter olmali!";
    return;
  }
  if (newPass !== confirmPass) {
    error.textContent = "Yeni sifreler eslesmiyor!";
    return;
  }

  const newHash = await hashPassword(newPass);
  chrome.storage.local.set({ passwordHash: newHash }, () => {
    $("changePassForm").style.display = "none";
    $("changePassToggle").textContent = "Sifre degistirildi!";
    setTimeout(() => {
      $("changePassToggle").textContent = "Sifreyi Degistir";
    }, 2000);
  });
});

// -- Sunucu Ayarlari --
async function loadServerSettings() {
  const data = await chrome.storage.local.get(["syncMode", "serverUrl", "lastSync", "clientName"]);
  const mode = data.syncMode || "local";
  const serverUrl = data.serverUrl || "";

  setSyncTab(mode);
  $("serverUrlInput").value = serverUrl;
  $("clientNameInput").value = data.clientName || "";

  if (data.lastSync) {
    const date = new Date(data.lastSync);
    $("syncTime").textContent = "Son senkronizasyon: " + date.toLocaleTimeString("tr-TR");
  }

  // Sunucu modundayken lokal ekleme/silme devre disi
  const isServer = mode === "server";
  $("urlAddBtn").disabled = isServer;
  $("kwAddBtn").disabled = isServer;
  $("urlInput").disabled = isServer;
  $("kwInput").disabled = isServer;
  if (isServer) {
    $("urlInput").placeholder = "Sunucu modunda - admin panelinden yonetin";
    $("kwInput").placeholder = "Sunucu modunda - admin panelinden yonetin";
  } else {
    $("urlInput").placeholder = "ornek.com veya *kelime*";
    $("kwInput").placeholder = "Engellenecek kelime";
  }
}

function setSyncTab(mode) {
  $("tabLocal").classList.toggle("active", mode === "local");
  $("tabServer").classList.toggle("active", mode === "server");
  $("serverSettings").style.display = mode === "server" ? "block" : "none";
}

$("tabLocal").addEventListener("click", () => {
  setSyncTab("local");
  chrome.storage.local.set({ syncMode: "local" });
  loadServerSettings();
});

$("tabServer").addEventListener("click", () => {
  setSyncTab("server");
  chrome.storage.local.set({ syncMode: "server" });
  loadServerSettings();
});

$("clientNameInput").addEventListener("change", () => {
  chrome.storage.local.set({ clientName: $("clientNameInput").value.trim() });
});

$("serverSaveBtn").addEventListener("click", async () => {
  const url = $("serverUrlInput").value.trim();
  const clientName = $("clientNameInput").value.trim();
  const info = $("serverInfo");

  if (!url) {
    info.textContent = "URL bos olamaz!";
    info.style.color = "#e74c3c";
    return;
  }

  info.textContent = "Baglaniyor...";
  info.style.color = "#888";

  try {
    const testUrl = url.replace(/\/+$/, "") + "/api/rules";
    const response = await fetch(testUrl, { signal: AbortSignal.timeout(5000) });

    if (response.ok) {
      chrome.storage.local.set({ serverUrl: url, syncMode: "server", clientName }, () => {
        info.textContent = "Baglanti basarili!";
        info.style.color = "#4caf50";
        // Hemen senkronize et
        chrome.runtime.sendMessage({ action: "forceSync" }, () => {
          setTimeout(() => { loadFilters(); loadServerSettings(); }, 1000);
        });
      });
    } else {
      info.textContent = "Sunucu yanit vermedi (HTTP " + response.status + ")";
      info.style.color = "#e74c3c";
    }
  } catch (e) {
    info.textContent = "Baglanti basarisiz: " + e.message;
    info.style.color = "#e74c3c";
  }
});

$("serverSyncBtn").addEventListener("click", () => {
  const info = $("serverInfo");
  info.textContent = "Senkronize ediliyor...";
  info.style.color = "#888";

  chrome.runtime.sendMessage({ action: "forceSync" }, () => {
    setTimeout(() => {
      info.textContent = "Senkronize edildi!";
      info.style.color = "#4caf50";
      loadFilters();
      loadServerSettings();
      setTimeout(() => { info.textContent = ""; }, 2000);
    }, 1000);
  });
});

$("serverUrlInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("serverSaveBtn").click();
});

// XSS korumasi icin HTML escape
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
