// ATLANTIS - Donanim & Ag Izleme Agent
// Her istemci PC'de arka planda calisir, sunucuya raporlar

const http = require("http");
const https = require("https");
const { execSync } = require("child_process");
const os = require("os");

// --- Ayarlar ---
const SERVER_URL = process.argv[2] || "http://localhost:3000";
const REPORT_INTERVAL = 60000; // 60 saniye

// --- Windows komut calistirici ---
function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", timeout: 10000, windowsHide: true }).trim();
  } catch { return ""; }
}

function runPS(cmd) {
  return run(`powershell -NoProfile -Command "${cmd}"`);
}

// --- Donanim Bilgileri ---
function getHardwareInfo() {
  const cpuModel = run("wmic cpu get Name /value").replace("Name=", "").trim();
  const cpuCores = os.cpus().length;
  const cpuUsage = getCpuUsage();

  const totalRam = os.totalmem();
  const freeRam = os.freemem();
  const usedRam = totalRam - freeRam;

  const gpuInfo = run("wmic path win32_videocontroller get Name /value").replace("Name=", "").trim().split("\n")[0] || "Bilinmiyor";

  const disks = getDiskInfo();

  const osInfo = `${os.type()} ${os.release()}`;
  const hostname = os.hostname();
  const uptime = os.uptime();

  const network = getNetworkInfo();

  return {
    hostname,
    os: osInfo,
    uptime,
    cpu: {
      model: cpuModel || os.cpus()[0]?.model || "Bilinmiyor",
      cores: cpuCores,
      usage: cpuUsage
    },
    ram: {
      total: totalRam,
      used: usedRam,
      free: freeRam,
      percent: Math.round((usedRam / totalRam) * 100)
    },
    gpu: gpuInfo.trim(),
    disks,
    network
  };
}

function getCpuUsage() {
  try {
    const val = runPS("(Get-CimInstance Win32_Processor).LoadPercentage");
    return parseInt(val) || 0;
  } catch { return 0; }
}

function getDiskInfo() {
  try {
    const raw = run("wmic logicaldisk where DriveType=3 get DeviceID,Size,FreeSpace /format:csv");
    const lines = raw.split("\n").filter(l => l.includes(",") && !l.startsWith("Node"));
    return lines.map(line => {
      const parts = line.trim().split(",");
      const letter = parts[1] || "?";
      const free = parseInt(parts[2]) || 0;
      const total = parseInt(parts[3]) || 0;
      const used = total - free;
      return {
        letter,
        total,
        used,
        free,
        percent: total > 0 ? Math.round((used / total) * 100) : 0
      };
    });
  } catch { return []; }
}

// Onceki olcum (fark hesabi icin)
let prevNetStats = null;
let prevNetTime = null;

function getNetworkInfo() {
  const interfaces = os.networkInterfaces();
  const result = [];

  // Adapter link hizini al
  let linkSpeed = "";
  try {
    linkSpeed = runPS("(Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1).LinkSpeed").trim();
  } catch {}

  // Toplam upload/download - tum aktif adaptorler
  let totalSent = 0;
  let totalRecv = 0;
  try {
    const raw = runPS("Get-NetAdapterStatistics | Where-Object { $_.ReceivedBytes -gt 0 } | Select-Object Name,SentBytes,ReceivedBytes | Format-Table -HideTableHeaders");
    const lines = raw.split("\n").filter(l => l.trim());
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        totalSent += parseInt(parts[parts.length - 2]) || 0;
        totalRecv += parseInt(parts[parts.length - 1]) || 0;
      }
    }
  } catch {}

  // Son 60sn'lik hiz hesapla
  const now = Date.now();
  let downloadSpeed = 0; // bytes/sec
  let uploadSpeed = 0;

  if (prevNetStats && prevNetTime) {
    const elapsed = (now - prevNetTime) / 1000;
    if (elapsed > 0) {
      downloadSpeed = Math.max(0, (totalRecv - prevNetStats.recv) / elapsed);
      uploadSpeed = Math.max(0, (totalSent - prevNetStats.sent) / elapsed);
    }
  }

  prevNetStats = { sent: totalSent, recv: totalRecv };
  prevNetTime = now;

  for (const [name, addrs] of Object.entries(interfaces)) {
    const ipv4 = addrs.find(a => a.family === "IPv4" && !a.internal);
    if (ipv4) {
      result.push({
        name,
        ip: ipv4.address,
        mac: ipv4.mac,
        speed: linkSpeed || "Bilinmiyor"
      });
    }
  }

  return {
    interfaces: result,
    totalSent,
    totalRecv,
    downloadSpeed: Math.round(downloadSpeed),
    uploadSpeed: Math.round(uploadSpeed)
  };
}

// --- Ag Hizi Testi ---
async function measureNetworkSpeed() {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const url = SERVER_URL.replace(/\/+$/, "") + "/api/speedtest";
    const client = url.startsWith("https") ? https : http;

    const req = client.get(url, { timeout: 10000 }, (res) => {
      let bytes = 0;
      res.on("data", (chunk) => { bytes += chunk.length; });
      res.on("end", () => {
        const elapsed = (Date.now() - startTime) / 1000;
        const mbps = elapsed > 0 ? ((bytes * 8) / (1000000 * elapsed)).toFixed(2) : 0;
        resolve({ bytes, elapsed: elapsed.toFixed(2), mbps: parseFloat(mbps) });
      });
    });

    req.on("error", () => resolve({ bytes: 0, elapsed: 0, mbps: 0 }));
    req.on("timeout", () => { req.destroy(); resolve({ bytes: 0, elapsed: 0, mbps: 0 }); });
  });
}

// --- Sunucuya Raporla ---
async function report() {
  try {
    const hardware = getHardwareInfo();
    const speed = await measureNetworkSpeed();

    const payload = JSON.stringify({
      timestamp: Date.now(),
      hardware,
      networkSpeed: speed
    });

    const urlObj = new URL(SERVER_URL.replace(/\/+$/, "") + "/api/hardware");
    const client = urlObj.protocol === "https:" ? https : http;

    const req = client.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
      timeout: 10000
    }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        console.log(`[${new Date().toLocaleTimeString("tr-TR")}] Rapor gonderildi - CPU: ${hardware.cpu.usage}% RAM: ${hardware.ram.percent}% Hiz: ${speed.mbps} Mbps`);
      });
    });

    req.on("error", (e) => console.warn("Rapor gonderilemedi:", e.message));
    req.on("timeout", () => { req.destroy(); });
    req.write(payload);
    req.end();
  } catch (e) {
    console.warn("Hata:", e.message);
  }
}

// --- Baslat ---
console.log("");
console.log("  ATLANTIS Donanim Agent");
console.log("  Sunucu: " + SERVER_URL);
console.log("  Rapor araligi: " + (REPORT_INTERVAL / 1000) + "sn");
console.log("  Hostname: " + os.hostname());
console.log("");

report();
setInterval(report, REPORT_INTERVAL);
