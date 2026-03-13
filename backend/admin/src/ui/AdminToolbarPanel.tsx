import type React from 'react';

type FilterKey = 'needs_action' | 'in_progress' | 'submitted' | 'offline' | 'refills' | 'all';
type SortKey = 'id_desc' | 'recent_activity';

type FilterCounts = {
  needs_action: number;
  in_progress: number;
  submitted: number;
  offline: number;
  refills: number;
  all: number;
};

type AdminToolbarPanelProps = {
  onlyMain: boolean;
  onOnlyMainChange: (next: boolean) => void;
  onlyOnline: boolean;
  onOnlyOnlineChange: (next: boolean) => void;
  onlyCurrent: boolean;
  onOnlyCurrentChange: (next: boolean) => void;
  sortBy: SortKey;
  onSortByChange: (next: SortKey) => void;
  pageSize: number;
  onPageSizeChange: (next: number) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  filter: FilterKey;
  onFilterChange: (next: FilterKey) => void;
  filterCounts: FilterCounts;
  hasPending: boolean;
  pendingCount: number;
  applyPending: () => void;
  onApplyPreset: (preset: 'new_entered' | 'needs_action' | 'online' | 'refills') => void;
};

const chipBase: React.CSSProperties = {
  borderRadius: 10,
  border: '1px solid #30363d',
  padding: '6px 10px',
  fontSize: 12,
  lineHeight: 1,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
};

function FilterChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...chipBase,
        background: active ? 'rgba(31,111,235,0.18)' : '#161b22',
        border: active ? '1px solid rgba(31,111,235,0.45)' : '1px solid #30363d',
        color: active ? '#9ecbff' : '#c9d1d9',
      }}
    >
      {label}
      <span style={{ marginLeft: 6, fontFamily: 'Consolas, monospace', fontSize: 11, opacity: 0.9 }}>{count}</span>
    </button>
  );
}

function ToggleChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...chipBase,
        background: active ? 'rgba(34,197,94,0.16)' : '#161b22',
        border: active ? '1px solid rgba(34,197,94,0.35)' : '1px solid #30363d',
        color: active ? '#9ae6b4' : '#c9d1d9',
      }}
    >
      {label}
    </button>
  );
}

function ToolbarSelect({
  value,
  onChange,
  children,
}: {
  value: string | number;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        borderRadius: 10,
        border: '1px solid #30363d',
        background: '#0d1117',
        color: '#c9d1d9',
        padding: '6px 10px',
        fontSize: 12,
        lineHeight: 1,
        outline: 'none',
      }}
    >
      {children}
    </select>
  );
}

export function AdminToolbarPanel({
  onlyMain,
  onOnlyMainChange,
  onlyOnline,
  onOnlyOnlineChange,
  sortBy,
  onSortByChange,
  pageSize,
  onPageSizeChange,
  filter,
  onFilterChange,
  filterCounts,
  hasPending,
  pendingCount,
  applyPending,
  onApplyPreset,
}: AdminToolbarPanelProps) {
  return (
    <div
      style={{
        marginBottom: 12,
        borderRadius: 12,
        border: '1px solid #30363d',
        background: 'rgba(22,27,34,0.96)',
        padding: 10,
        boxShadow: '0 10px 24px rgba(0,0,0,0.2)',
        overflowX: 'auto',
      }}
    >
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', minWidth: 'max-content' }}>
        <FilterChip active={filter === 'needs_action'} label="需处理" count={filterCounts.needs_action} onClick={() => onFilterChange('needs_action')} />
        <FilterChip active={filter === 'in_progress'} label="填写中" count={filterCounts.in_progress} onClick={() => onFilterChange('in_progress')} />
        <FilterChip active={filter === 'submitted'} label="已提交" count={filterCounts.submitted} onClick={() => onFilterChange('submitted')} />
        <FilterChip active={filter === 'offline'} label="离线" count={filterCounts.offline} onClick={() => onFilterChange('offline')} />
        <FilterChip active={filter === 'refills'} label="重填" count={filterCounts.refills} onClick={() => onFilterChange('refills')} />
        <FilterChip active={filter === 'all'} label="全部" count={filterCounts.all} onClick={() => onFilterChange('all')} />

        <div style={{ width: 1, height: 22, background: '#30363d' }} />

        <ToggleChip active={onlyMain} label="仅主记录" onClick={() => onOnlyMainChange(!onlyMain)} />
        <ToggleChip active={onlyOnline} label="仅在线" onClick={() => onOnlyOnlineChange(!onlyOnline)} />

        <div style={{ width: 1, height: 22, background: '#30363d' }} />

        <ToolbarSelect value={sortBy} onChange={(value) => onSortByChange(value as SortKey)}>
          <option value="id_desc">序号倒序</option>
          <option value="recent_activity">按最近活跃</option>
        </ToolbarSelect>

        <ToolbarSelect value={pageSize} onChange={(value) => onPageSizeChange(Number(value))}>
          <option value="30">30条</option>
          <option value="50">50条</option>
          <option value="100">100条</option>
          <option value="200">200条</option>
        </ToolbarSelect>

        <ToolbarSelect
          value=""
          onChange={(value) => {
            const preset = value as '' | 'new_entered' | 'needs_action' | 'online' | 'refills';
            if (!preset) return;
            onApplyPreset(preset);
          }}
        >
          <option value="">快捷视图</option>
          <option value="new_entered">刚进入</option>
          <option value="needs_action">待处理</option>
          <option value="online">在线用户</option>
          <option value="refills">重填记录</option>
        </ToolbarSelect>

        {hasPending && (
          <button
            type="button"
            onClick={applyPending}
            style={{
              borderRadius: 10,
              border: '1px solid rgba(88,166,255,0.45)',
              background: 'rgba(88,166,255,0.2)',
              color: '#c9e4ff',
              padding: '6px 10px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            刷新{pendingCount > 0 ? ` ${pendingCount}` : ''}
          </button>
        )}
      </div>
    </div>
  );
}
