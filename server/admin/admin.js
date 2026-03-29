// ATLANTIS - Admin Panel

const API = window.location.origin;
let token = localStorage.getItem("atlantis_token") || "";

const $ = (id) => document.getElementById(id);

async function api(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (token) opts.headers["Authorization"] = "Bearer " + token;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Hata olustu");
  return data;
}

// --- Baslangic ---
async function init() {
  $("serverAddr").textContent = window.location.origin;
  setupMainTabs();

  if (token) {
    try { await api("GET", "/api/status"); showMain(); return; }
    catch { token = ""; localStorage.removeItem("atlantis_token"); }
  }

  try { await api("POST", "/api/admin/login", { password: "" }); }
  catch (e) {
    if (e.message === "Admin henuz olusturulmadi") {
      $("authSubtitle").textContent = "Ilk Kurulum - Sifre Olusturun";
      $("authConfirmGroup").style.display = "block";
      $("authBtn").textContent = "Sifre Olustur";
      $("authBtn").dataset.mode = "setup";
    }
  }
}

// --- Ust Sekme Navigasyonu ---
function setupMainTabs() {
  document.querySelectorAll(".main-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".main-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      tab.classList.add("active");
      $("tab-" + tab.dataset.tab).classList.add("active");

      // Sekme degisince veri yukle
      if (tab.dataset.tab === "violations") loadViolations();
      if (tab.dataset.tab === "traffic") loadTraffic();
      if (tab.dataset.tab === "clients") loadClients();
    });
  });
}

// --- Auth ---
$("authBtn").addEventListener("click", async () => {
  const pass = $("authPass").value;
  const error = $("authError");
  error.textContent = "";
  try {
    if ($("authBtn").dataset.mode === "setup") {
      const confirm = $("authPassConfirm").value;
      if (pass.length < 4) { error.textContent = "Sifre en az 4 karakter olmali!"; return; }
      if (pass !== confirm) { error.textContent = "Sifreler eslesmiyor!"; return; }
      const data = await api("POST", "/api/admin/setup", { password: pass });
      token = data.token;
    } else {
      const data = await api("POST", "/api/admin/login", { password: pass });
      token = data.token;
    }
    localStorage.setItem("atlantis_token", token);
    showMain();
  } catch (e) { error.textContent = e.message; }
});

$("authPass").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { $("authConfirmGroup").style.display !== "none" ? $("authPassConfirm").focus() : $("authBtn").click(); }
});
$("authPassConfirm").addEventListener("keydown", (e) => { if (e.key === "Enter") $("authBtn").click(); });

// --- Ana Panel ---
async function showMain() {
  $("authView").style.display = "none";
  $("mainView").style.display = "block";
  await loadAll();
}

async function loadAll() {
  try {
    const [rules, status] = await Promise.all([
      api("GET", "/api/rules"),
      api("GET", "/api/status")
    ]);
    renderState(rules, status);
  } catch (e) { console.error("Yuklenemedi:", e); }
}

function renderState(rules, status) {
  // Toggle'lar
  const enabled = rules.extensionEnabled !== false;
  $("enabledToggle").checked = enabled;
  $("statusDot").className = "status-dot" + (enabled ? "" : " inactive");
  $("statusText").textContent = enabled ? "Aktif" : "Pasif";
  $("logViolationsToggle").checked = rules.logViolations !== false;
  $("logTrafficToggle").checked = rules.logTraffic === true;

  // Block action
  const action = rules.blockAction || "page";
  $("tabPage").classList.toggle("active", action === "page");
  $("tabRedirect").classList.toggle("active", action === "redirect");
  $("redirectBox").style.display = action === "redirect" ? "block" : "none";
  $("redirectUrlInput").value = rules.redirectUrl || "";

  // Stats
  $("statUrl").textContent = rules.urlFilters.length;
  $("statKw").textContent = rules.keywordFilters.length;

  // Badges
  if (status) {
    $("badgeViolations").textContent = status.totalViolations || 0;
    $("badgeTraffic").textContent = status.totalTraffic || 0;
    $("badgeClients").textContent = (status.clients || []).length;
  }

  renderUrlList(rules.urlFilters);
  renderKwList(rules.keywordFilters);
}

// --- Toggle Ayarlari ---
$("enabledToggle").addEventListener("change", async () => {
  const enabled = $("enabledToggle").checked;
  await api("PUT", "/api/config", { extensionEnabled: enabled });
  $("statusDot").className = "status-dot" + (enabled ? "" : " inactive");
  $("statusText").textContent = enabled ? "Aktif" : "Pasif";
});

$("logViolationsToggle").addEventListener("change", async () => {
  await api("PUT", "/api/config", { logViolations: $("logViolationsToggle").checked });
});

$("logTrafficToggle").addEventListener("change", async () => {
  await api("PUT", "/api/config", { logTraffic: $("logTrafficToggle").checked });
});

// --- Block Action ---
$("tabPage").addEventListener("click", async () => {
  $("tabPage").classList.add("active"); $("tabRedirect").classList.remove("active");
  $("redirectBox").style.display = "none";
  await api("PUT", "/api/config", { blockAction: "page" });
});
$("tabRedirect").addEventListener("click", async () => {
  $("tabRedirect").classList.add("active"); $("tabPage").classList.remove("active");
  $("redirectBox").style.display = "block";
  await api("PUT", "/api/config", { blockAction: "redirect" });
});
$("redirectSaveBtn").addEventListener("click", async () => {
  const url = $("redirectUrlInput").value.trim();
  if (!url) return;
  await api("PUT", "/api/config", { redirectUrl: url });
  $("redirectSaveBtn").textContent = "Kaydedildi!";
  setTimeout(() => { $("redirectSaveBtn").textContent = "Kaydet"; }, 1500);
});

// --- URL Filtreleri ---
function renderUrlList(filters) {
  const list = $("urlList"); const empty = $("urlEmpty");
  list.innerHTML = "";
  if (filters.length === 0) { empty.style.display = "block"; return; }
  empty.style.display = "none";
  filters.forEach(f => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${esc(f.pattern)}</span>`;
    const btn = document.createElement("button"); btn.className = "btn-del"; btn.textContent = "Sil";
    btn.addEventListener("click", async () => { await api("DELETE", "/api/rules/url/" + f.id); loadAll(); });
    li.appendChild(btn); list.appendChild(li);
  });
}
$("urlAddBtn").addEventListener("click", addUrl);
$("urlInput").addEventListener("keydown", (e) => { if (e.key === "Enter") addUrl(); });
async function addUrl() {
  const input = $("urlInput"); const val = input.value.trim(); if (!val) return;
  try { await api("POST", "/api/rules/url", { pattern: val }); input.value = ""; loadAll(); }
  catch (e) { alert(e.message); }
}

// --- Kelime Filtreleri ---
function renderKwList(filters) {
  const list = $("kwList"); const empty = $("kwEmpty");
  list.innerHTML = "";
  if (filters.length === 0) { empty.style.display = "block"; return; }
  empty.style.display = "none";
  filters.forEach(f => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${esc(f.keyword)}</span>`;
    const btn = document.createElement("button"); btn.className = "btn-del"; btn.textContent = "Sil";
    btn.addEventListener("click", async () => { await api("DELETE", "/api/rules/keyword/" + f.id); loadAll(); });
    li.appendChild(btn); list.appendChild(li);
  });
}
$("kwAddBtn").addEventListener("click", addKw);
$("kwInput").addEventListener("keydown", (e) => { if (e.key === "Enter") addKw(); });
async function addKw() {
  const input = $("kwInput"); const val = input.value.trim(); if (!val) return;
  try { await api("POST", "/api/rules/keyword", { keyword: val }); input.value = ""; loadAll(); }
  catch (e) { alert(e.message); }
}

// =============================================
// IHLAL KAYITLARI
// =============================================
let violationPage = 1;

async function loadViolations(page) {
  violationPage = page || 1;
  try {
    const data = await api("GET", `/api/logs?page=${violationPage}&limit=50`);
    $("violationCount").textContent = data.total + " kayit";
    $("badgeViolations").textContent = data.total;

    const tbody = $("violationBody");
    tbody.innerHTML = "";

    if (data.data.length === 0) { $("violationEmpty").style.display = "block"; return; }
    $("violationEmpty").style.display = "none";

    for (const log of data.data) {
      const tr = document.createElement("tr");
      const reasonClass = log.reason === "keyword" ? "reason-keyword" : "reason-url";
      const reasonText = log.reason === "keyword" ? "Kelime" : "URL";
      tr.innerHTML = `
        <td>${formatTime(log.timestamp)}</td>
        <td>${esc(log.clientName)}</td>
        <td><code>${esc(log.ip)}</code></td>
        <td title="${esc(log.url)}">${esc(log.url)}</td>
        <td class="${reasonClass}">${reasonText}</td>
        <td>${esc(log.match)}</td>
      `;
      tbody.appendChild(tr);
    }

    renderPagination("violationPagination", data.pages, violationPage, (p) => loadViolations(p));
  } catch (e) { console.error("Ihlal kayitlari yuklenemedi:", e); }
}

$("violationRefresh").addEventListener("click", () => loadViolations(violationPage));
$("violationClear").addEventListener("click", async () => {
  if (!confirm("Tum ihlal kayitlari silinecek. Emin misiniz?")) return;
  await api("DELETE", "/api/logs");
  loadViolations(1);
});

// =============================================
// AG TRAFIGI
// =============================================
let trafficPage = 1;

async function loadTraffic(page) {
  trafficPage = page || 1;
  try {
    const data = await api("GET", `/api/traffic?page=${trafficPage}&limit=50`);
    $("trafficCount").textContent = data.total + " kayit";
    $("badgeTraffic").textContent = data.total;

    const tbody = $("trafficBody");
    tbody.innerHTML = "";

    if (data.data.length === 0) { $("trafficEmpty").style.display = "block"; return; }
    $("trafficEmpty").style.display = "none";

    for (const t of data.data) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatTime(t.timestamp)}</td>
        <td>${esc(t.clientName)}</td>
        <td><code>${esc(t.ip)}</code></td>
        <td title="${esc(t.url)}">${esc(t.url)}</td>
        <td>${esc(t.pageTitle)}</td>
      `;
      tbody.appendChild(tr);
    }

    renderPagination("trafficPagination", data.pages, trafficPage, (p) => loadTraffic(p));
  } catch (e) { console.error("Trafik kayitlari yuklenemedi:", e); }
}

$("trafficRefresh").addEventListener("click", () => loadTraffic(trafficPage));
$("trafficClear").addEventListener("click", async () => {
  if (!confirm("Tum trafik kayitlari silinecek. Emin misiniz?")) return;
  await api("DELETE", "/api/traffic");
  loadTraffic(1);
});

// =============================================
// ISTEMCILER
// =============================================
async function loadClients() {
  try {
    const status = await api("GET", "/api/status");
    const clients = status.clients || [];
    $("badgeClients").textContent = clients.length;

    const tbody = $("clientsBody");
    tbody.innerHTML = "";

    if (clients.length === 0) { $("clientsEmpty").style.display = "block"; return; }
    $("clientsEmpty").style.display = "none";

    for (const c of clients) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(c.name)}</td>
        <td><code>${esc(c.ip)}</code></td>
        <td>${formatTime(c.lastSeen)}</td>
        <td><code style="font-size:11px;color:#666">${esc(c.id)}</code></td>
      `;
      tbody.appendChild(tr);
    }
  } catch (e) { console.error("Istemciler yuklenemedi:", e); }
}

// =============================================
// Yardimcilar
// =============================================
function esc(str) {
  if (!str) return "";
  const d = document.createElement("div"); d.textContent = str; return d.innerHTML;
}

function formatTime(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  const date = d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `${date} ${time}`;
}

function renderPagination(containerId, totalPages, currentPage, onPageClick) {
  const container = $(containerId);
  container.innerHTML = "";
  if (totalPages <= 1) return;

  const maxShow = 7;
  let start = Math.max(1, currentPage - 3);
  let end = Math.min(totalPages, start + maxShow - 1);
  if (end - start < maxShow - 1) start = Math.max(1, end - maxShow + 1);

  if (currentPage > 1) {
    const prev = document.createElement("button");
    prev.textContent = "<";
    prev.addEventListener("click", () => onPageClick(currentPage - 1));
    container.appendChild(prev);
  }

  for (let i = start; i <= end; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    if (i === currentPage) btn.className = "active";
    btn.addEventListener("click", () => onPageClick(i));
    container.appendChild(btn);
  }

  if (currentPage < totalPages) {
    const next = document.createElement("button");
    next.textContent = ">";
    next.addEventListener("click", () => onPageClick(currentPage + 1));
    container.appendChild(next);
  }
}

// Cikis
$("logoutBtn").addEventListener("click", () => {
  token = ""; localStorage.removeItem("atlantis_token"); location.reload();
});

// Baslat
init();
