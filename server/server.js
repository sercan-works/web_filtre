const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "rules.json");
const LOGS_FILE = path.join(DATA_DIR, "logs.json");
const TRAFFIC_FILE = path.join(DATA_DIR, "traffic.json");
const ADMIN_FILE = path.join(DATA_DIR, "admin.json");
const CLIENTS_FILE = path.join(DATA_DIR, "clients.json");
const ADMIN_DIR = path.join(__dirname, "admin");

const MAX_LOGS = 10000;
const MAX_TRAFFIC = 50000;

app.use(express.json({ limit: "1mb" }));

// CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use("/admin", express.static(ADMIN_DIR));

// --- Veri Okuma/Yazma ---
function readJSON(file, defaults) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { fs.writeFileSync(file, JSON.stringify(defaults, null, 2)); return defaults; }
}
function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

function readRules() {
  const defaults = {
    urlFilters: [], keywordFilters: [],
    blockAction: "page", redirectUrl: "", extensionEnabled: true,
    logViolations: true, logTraffic: false
  };
  const data = readJSON(DATA_FILE, defaults);
  // Eksik alanlari default'larla doldur
  return { ...defaults, ...data };
}
function readLogs() { return readJSON(LOGS_FILE, []); }
function readTraffic() { return readJSON(TRAFFIC_FILE, []); }
function readClients() { return readJSON(CLIENTS_FILE, {}); } // { "ip": { name, lastSeen } }

function getClientIp(req) {
  let ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
    || req.socket?.remoteAddress || "bilinmiyor";
  // IPv6 localhost -> IPv4
  if (ip === "::1" || ip === "::ffff:127.0.0.1") ip = "127.0.0.1";
  if (ip.startsWith("::ffff:")) ip = ip.substring(7);
  return ip;
}

// IP'ye gore istemci adini bul
function getClientName(ip) {
  const clients = readClients();
  return (clients[ip] && clients[ip].name) || ip;
}

// Istemci son gorulme guncelle
function touchClient(ip) {
  const clients = readClients();
  if (!clients[ip]) clients[ip] = { name: ip };
  clients[ip].lastSeen = Date.now();
  writeJSON(CLIENTS_FILE, clients);
}

function sha256(str) { return crypto.createHash("sha256").update(str).digest("hex"); }

function getAdmin() {
  try { return JSON.parse(fs.readFileSync(ADMIN_FILE, "utf8")); } catch { return null; }
}
function saveAdmin(data) { fs.writeFileSync(ADMIN_FILE, JSON.stringify(data, null, 2)); }

// --- Auth ---
function requireAuth(req, res, next) {
  const admin = getAdmin();
  if (!admin) return res.status(401).json({ error: "Admin sifresi henuz olusturulmadi" });
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ error: "Yetkilendirme gerekli" });
  if (auth.substring(7) !== admin.token) return res.status(401).json({ error: "Gecersiz token" });
  next();
}

// =============================================
// PUBLIC: Extension'lar icin
// =============================================

app.get("/api/rules", (req, res) => { res.json(readRules()); });

// Ihlal bildirimi
app.post("/api/logs", (req, res) => {
  const rules = readRules();
  if (rules.logViolations === false) return res.json({ success: true, saved: false });

  const { url, reason, match, pageTitle } = req.body;
  const ip = getClientIp(req);
  const clientName = getClientName(ip);
  touchClient(ip);

  const entry = {
    id: "log_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
    timestamp: Date.now(), ip, clientName,
    url: url || "", reason: reason || "url",
    match: match || "", pageTitle: pageTitle || ""
  };

  const logs = readLogs();
  logs.unshift(entry);
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
  writeJSON(LOGS_FILE, logs);

  console.log(`[IHLAL] ${clientName} (${ip}) -> ${entry.url} [${entry.reason}: ${entry.match}]`);
  res.json({ success: true, saved: true });
});

// Trafik bildirimi (toplu)
app.post("/api/traffic", (req, res) => {
  const rules = readRules();
  if (rules.logTraffic === false) return res.json({ success: true, saved: false, count: 0 });

  const { entries } = req.body;
  const ip = getClientIp(req);
  const clientName = getClientName(ip);
  touchClient(ip);

  if (!Array.isArray(entries) || entries.length === 0) return res.json({ success: true, count: 0 });

  const traffic = readTraffic();
  for (const e of entries) {
    traffic.unshift({
      id: "tr_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      timestamp: e.timestamp || Date.now(), ip, clientName,
      url: e.url || "", pageTitle: e.title || ""
    });
  }
  if (traffic.length > MAX_TRAFFIC) traffic.length = MAX_TRAFFIC;
  writeJSON(TRAFFIC_FILE, traffic);

  res.json({ success: true, saved: true, count: entries.length });
});

// =============================================
// AUTH: Admin islemleri
// =============================================

app.post("/api/admin/setup", (req, res) => {
  if (getAdmin()) return res.status(400).json({ error: "Admin zaten olusturuldu" });
  const { password } = req.body;
  if (!password || password.length < 4) return res.status(400).json({ error: "Sifre en az 4 karakter olmali" });
  const token = crypto.randomBytes(32).toString("hex");
  saveAdmin({ passwordHash: sha256(password), token });
  res.json({ token });
});

app.post("/api/admin/login", (req, res) => {
  const admin = getAdmin();
  if (!admin) return res.status(400).json({ error: "Admin henuz olusturulmadi" });
  const { password } = req.body;
  if (sha256(password) !== admin.passwordHash) return res.status(401).json({ error: "Yanlis sifre" });
  const token = crypto.randomBytes(32).toString("hex");
  admin.token = token;
  saveAdmin(admin);
  res.json({ token });
});

app.post("/api/admin/change-password", requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const admin = getAdmin();
  if (sha256(oldPassword) !== admin.passwordHash) return res.status(401).json({ error: "Mevcut sifre yanlis" });
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: "Yeni sifre en az 4 karakter olmali" });
  admin.passwordHash = sha256(newPassword);
  const token = crypto.randomBytes(32).toString("hex");
  admin.token = token;
  saveAdmin(admin);
  res.json({ token });
});

// --- Config (blockAction, redirectUrl, extensionEnabled, logViolations, logTraffic) ---
app.put("/api/config", requireAuth, (req, res) => {
  const rules = readRules();
  const allowed = ["blockAction", "redirectUrl", "extensionEnabled", "logViolations", "logTraffic"];
  for (const key of allowed) {
    if (req.body[key] !== undefined) rules[key] = req.body[key];
  }
  writeJSON(DATA_FILE, rules);
  res.json(rules);
});

// --- Kural Yonetimi ---
app.post("/api/rules/url", requireAuth, (req, res) => {
  const rules = readRules();
  const { pattern } = req.body;
  if (!pattern || !pattern.trim()) return res.status(400).json({ error: "Pattern bos olamaz" });
  const trimmed = pattern.trim();
  if (rules.urlFilters.some(f => f.pattern === trimmed)) return res.status(400).json({ error: "Bu filtre zaten mevcut" });
  const entry = { id: "uf_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6), pattern: trimmed, createdAt: Date.now() };
  rules.urlFilters.push(entry);
  writeJSON(DATA_FILE, rules);
  res.json(entry);
});

app.delete("/api/rules/url/:id", requireAuth, (req, res) => {
  const rules = readRules();
  const before = rules.urlFilters.length;
  rules.urlFilters = rules.urlFilters.filter(f => f.id !== req.params.id);
  if (rules.urlFilters.length === before) return res.status(404).json({ error: "Filtre bulunamadi" });
  writeJSON(DATA_FILE, rules);
  res.json({ success: true });
});

app.post("/api/rules/keyword", requireAuth, (req, res) => {
  const rules = readRules();
  const { keyword } = req.body;
  if (!keyword || !keyword.trim()) return res.status(400).json({ error: "Kelime bos olamaz" });
  const trimmed = keyword.trim();
  if (rules.keywordFilters.some(f => f.keyword === trimmed)) return res.status(400).json({ error: "Bu kelime zaten mevcut" });
  const entry = { id: "kf_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6), keyword: trimmed, createdAt: Date.now() };
  rules.keywordFilters.push(entry);
  writeJSON(DATA_FILE, rules);
  res.json(entry);
});

app.delete("/api/rules/keyword/:id", requireAuth, (req, res) => {
  const rules = readRules();
  const before = rules.keywordFilters.length;
  rules.keywordFilters = rules.keywordFilters.filter(f => f.id !== req.params.id);
  if (rules.keywordFilters.length === before) return res.status(404).json({ error: "Kelime bulunamadi" });
  writeJSON(DATA_FILE, rules);
  res.json({ success: true });
});

// --- Log / Trafik Goruntuleme ---
app.get("/api/logs", requireAuth, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const ip = req.query.ip || "";
  let logs = readLogs();
  if (ip) logs = logs.filter(l => l.ip === ip);
  const start = (page - 1) * limit;
  res.json({ total: logs.length, page, pages: Math.ceil(logs.length / limit), data: logs.slice(start, start + limit) });
});

app.delete("/api/logs", requireAuth, (req, res) => {
  writeJSON(LOGS_FILE, []);
  res.json({ success: true });
});

app.get("/api/traffic", requireAuth, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const ip = req.query.ip || "";
  let traffic = readTraffic();
  if (ip) traffic = traffic.filter(t => t.ip === ip);
  const start = (page - 1) * limit;
  res.json({ total: traffic.length, page, pages: Math.ceil(traffic.length / limit), data: traffic.slice(start, start + limit) });
});

app.delete("/api/traffic", requireAuth, (req, res) => {
  writeJSON(TRAFFIC_FILE, []);
  res.json({ success: true });
});

// --- Istemci Yonetimi (IP bazli) ---

// Istemci listesi
app.get("/api/clients", requireAuth, (req, res) => {
  const clients = readClients();
  res.json(Object.entries(clients).map(([ip, info]) => ({
    ip, name: info.name || ip, lastSeen: info.lastSeen || 0
  })));
});

// Istemci adini degistir
app.put("/api/clients/:ip", requireAuth, (req, res) => {
  const { name } = req.body;
  const clients = readClients();
  const ip = req.params.ip;
  if (!clients[ip]) clients[ip] = {};
  clients[ip].name = name || ip;
  writeJSON(CLIENTS_FILE, clients);
  res.json({ success: true, ip, name: clients[ip].name });
});

// --- Durum ---
app.get("/api/status", requireAuth, (req, res) => {
  const rules = readRules();
  const logs = readLogs();
  const traffic = readTraffic();
  const clients = readClients();

  // Loglardan/trafikten eksik istemcileri otomatik ekle
  for (const entry of [...logs.slice(0, 5000), ...traffic.slice(0, 5000)]) {
    if (entry.ip && !clients[entry.ip]) {
      clients[entry.ip] = { name: entry.ip, lastSeen: entry.timestamp };
    }
  }
  writeJSON(CLIENTS_FILE, clients);

  res.json({
    urlFilterCount: rules.urlFilters.length,
    keywordFilterCount: rules.keywordFilters.length,
    blockAction: rules.blockAction,
    extensionEnabled: rules.extensionEnabled,
    logViolations: rules.logViolations !== false,
    logTraffic: rules.logTraffic === true,
    totalViolations: logs.length,
    totalTraffic: traffic.length,
    clients: Object.entries(clients).map(([ip, info]) => ({
      ip, name: info.name || ip, lastSeen: info.lastSeen || 0
    }))
  });
});

// --- Sunucu Baslat ---
app.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("  ╔═══════════════════════════════════════╗");
  console.log("  ║       ATLANTIS Filtre Sunucusu        ║");
  console.log("  ╠═══════════════════════════════════════╣");
  console.log(`  ║  Sunucu: http://localhost:${PORT}          ║`);
  console.log(`  ║  Admin:  http://localhost:${PORT}/admin     ║`);
  console.log(`  ║  API:    http://localhost:${PORT}/api/rules ║`);
  console.log("  ╚═══════════════════════════════════════╝");
  console.log("");
});
