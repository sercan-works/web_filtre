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
      if (tab.dataset.tab === "hardware") loadHardware();
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
  // Istemci verisini de hemen yukle (clients.json'u doldurur)
  loadClients();
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
let violationIpFilter = "";

async function loadViolations(page, ipFilter) {
  violationPage = page || 1;
  if (ipFilter !== undefined) violationIpFilter = ipFilter;
  try {
    let endpoint = `/api/logs?page=${violationPage}&limit=50`;
    if (violationIpFilter) endpoint += `&ip=${encodeURIComponent(violationIpFilter)}`;
    const data = await api("GET", endpoint);
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
// ISTEMCILER (IP bazli)
// =============================================
async function loadClients() {
  try {
    const clients = await api("GET", "/api/clients");
    $("badgeClients").textContent = clients.length;
    $("clientCount").textContent = clients.length + " istemci";

    const tbody = $("clientsBody");
    tbody.innerHTML = "";

    if (clients.length === 0) { $("clientsEmpty").style.display = "block"; return; }
    $("clientsEmpty").style.display = "none";

    for (const c of clients) {
      const tr = document.createElement("tr");

      // Isim hucre - tiklaninca duzenlenebilir
      const tdName = document.createElement("td");
      const nameSpan = document.createElement("span");
      nameSpan.textContent = c.name;
      nameSpan.style.cursor = "pointer";
      nameSpan.title = "Tikla - isim degistir";
      nameSpan.addEventListener("click", () => {
        const input = document.createElement("input");
        input.type = "text";
        input.value = c.name;
        input.style.cssText = "width:120px;padding:4px 6px;font-size:13px;";
        tdName.innerHTML = "";
        tdName.appendChild(input);
        input.focus();

        async function save() {
          const newName = input.value.trim() || c.ip;
          await api("PUT", "/api/clients/" + encodeURIComponent(c.ip), { name: newName });
          loadClients();
        }
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
        input.addEventListener("blur", save);
      });
      tdName.appendChild(nameSpan);

      const tdIp = document.createElement("td");
      tdIp.innerHTML = `<code>${esc(c.ip)}</code>`;

      const tdSeen = document.createElement("td");
      tdSeen.textContent = formatTime(c.lastSeen);

      const tdAction = document.createElement("td");
      const filterBtn = document.createElement("button");
      filterBtn.className = "btn btn-small btn-primary";
      filterBtn.textContent = "Loglari Gor";
      filterBtn.style.fontSize = "11px";
      filterBtn.addEventListener("click", () => {
        // Ihlal sekmesine gec ve IP'ye gore filtrele
        document.querySelector('[data-tab="violations"]').click();
        loadViolations(1, c.ip);
      });
      tdAction.appendChild(filterBtn);

      tr.appendChild(tdName);
      tr.appendChild(tdIp);
      tr.appendChild(tdSeen);
      tr.appendChild(tdAction);
      tbody.appendChild(tr);
    }
  } catch (e) { console.error("Istemciler yuklenemedi:", e); }
}

$("clientRefresh").addEventListener("click", loadClients);

// =============================================
// DONANIM & AG
// =============================================
async function loadHardware() {
  try {
    const data = await api("GET", "/api/hardware");
    $("badgeHardware").textContent = data.length;
    $("hwCount").textContent = data.length + " cihaz";

    const grid = $("hwGrid");
    grid.innerHTML = "";

    if (data.length === 0) { $("hwEmpty").style.display = "block"; return; }
    $("hwEmpty").style.display = "none";

    for (const item of data) {
      const hw = item.hardware || {};
      const cpu = hw.cpu || {};
      const ram = hw.ram || {};
      const speed = item.networkSpeed || {};
      const disks = hw.disks || [];
      const net = hw.network || {};
      const nets = net.interfaces || net || [];
      const totalSent = net.totalSent || 0;
      const totalRecv = net.totalRecv || 0;
      const dlSpeed = net.downloadSpeed || 0;
      const ulSpeed = net.uploadSpeed || 0;

      const card = document.createElement("div");
      card.className = "hw-card";

      // Header
      const header = document.createElement("div");
      header.className = "hw-card-header";
      header.innerHTML = `<span class="hw-name">${esc(item.clientName)}</span><span class="hw-ip">${esc(item.ip)}</span>`;

      // Body
      const body = document.createElement("div");
      body.className = "hw-card-body";

      // OS + Hostname
      body.innerHTML += hwRow("Bilgisayar", esc(hw.hostname || "-"));
      body.innerHTML += hwRow("Isletim Sistemi", esc(hw.os || "-"));
      body.innerHTML += hwRow("Calisma Suresi", formatUptime(hw.uptime));

      // CPU
      body.innerHTML += hwRow("CPU", esc(cpu.model || "-"));
      body.innerHTML += hwRow("Cekirdek", cpu.cores || "-");
      body.innerHTML += hwBar("CPU Kullanim", cpu.usage || 0);

      // RAM
      body.innerHTML += hwBar("RAM Kullanim", ram.percent || 0,
        formatBytes(ram.used) + " / " + formatBytes(ram.total));

      // GPU
      body.innerHTML += hwRow("GPU", esc(hw.gpu || "-"));

      // Disks
      for (const d of disks) {
        body.innerHTML += hwBar(d.letter + " Disk", d.percent || 0,
          formatBytes(d.used) + " / " + formatBytes(d.total));
      }

      // Network interfaces
      const netList = Array.isArray(nets) ? nets : [];
      for (const n of netList) {
        body.innerHTML += hwRow("Ag (" + esc(n.ip) + ")", esc(n.speed));
      }

      // Toplam upload/download
      body.innerHTML += hwRow("Toplam Download", formatBytes(totalRecv));
      body.innerHTML += hwRow("Toplam Upload", formatBytes(totalSent));

      // Anlik hiz (son 60sn)
      body.innerHTML += `<div class="hw-speed">
        <div style="flex:1;text-align:center;">
          <span class="hw-speed-value" style="color:#4caf50">${formatBytesSpeed(dlSpeed)}</span>
          <span class="hw-speed-unit">Download/s</span>
        </div>
        <div style="flex:1;text-align:center;">
          <span class="hw-speed-value" style="color:#2196f3">${formatBytesSpeed(ulSpeed)}</span>
          <span class="hw-speed-unit">Upload/s</span>
        </div>
      </div>`;

      // Sunucu baglanti hizi
      body.innerHTML += `<div class="hw-speed" style="border-top:none;margin-top:0;padding-top:4px;">
        <span class="hw-speed-value">${speed.mbps || 0}</span>
        <span class="hw-speed-unit">Mbps<br>sunucu baglantisi</span>
      </div>`;

      // Updated
      const updated = document.createElement("div");
      updated.className = "hw-updated";
      updated.textContent = "Son guncelleme: " + formatTime(item.timestamp);

      card.appendChild(header);
      card.appendChild(body);
      card.appendChild(updated);
      grid.appendChild(card);
    }
  } catch (e) { console.error("Donanim yuklenemedi:", e); }
}

function hwRow(label, value) {
  return `<div class="hw-row"><span class="hw-label">${label}</span><span class="hw-value">${value}</span></div>`;
}

function hwBar(label, percent, detail) {
  const color = percent > 85 ? "red" : percent > 60 ? "yellow" : "green";
  const detailText = detail ? detail : percent + "%";
  return `<div class="hw-bar-wrap">
    <div class="hw-bar-label"><span>${label}</span><span>${detailText}</span></div>
    <div class="hw-bar"><div class="hw-bar-fill ${color}" style="width:${percent}%"></div></div>
  </div>`;
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "0";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return gb.toFixed(1) + " GB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return mb.toFixed(0) + " MB";
  const kb = bytes / 1024;
  return kb.toFixed(0) + " KB";
}

function formatBytesSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0) return "0";
  const mb = bytesPerSec / (1024 * 1024);
  if (mb >= 1) return mb.toFixed(1) + " MB";
  const kb = bytesPerSec / 1024;
  if (kb >= 1) return kb.toFixed(0) + " KB";
  return bytesPerSec + " B";
}

function formatUptime(seconds) {
  if (!seconds) return "-";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  let s = "";
  if (d > 0) s += d + "g ";
  if (h > 0) s += h + "sa ";
  s += m + "dk";
  return s;
}

$("hwRefresh").addEventListener("click", loadHardware);

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
