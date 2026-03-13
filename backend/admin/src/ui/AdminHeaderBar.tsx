type AdminHeaderBarProps = {
  title: string;
  onlineCount: number;
  clickRateLabel: string;
  onClear: () => void;
  onDownloadCsv: () => void;
};

export function AdminHeaderBar({ title, onlineCount, clickRateLabel, onClear, onDownloadCsv }: AdminHeaderBarProps) {
  return (
    <div
      style={{
        marginBottom: '12px',
        borderRadius: '12px',
        border: '1px solid #30363d',
        background: 'rgba(22,27,34,0.95)',
        padding: '8px',
        boxShadow: '0 10px 24px rgba(0,0,0,0.2)',
        overflowX: 'auto',
      }}
    >
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', minWidth: 'max-content' }}>
        <h1 style={{ fontSize: '12px', fontWeight: 600, color: '#e6edf3', letterSpacing: '0.01em', padding: '0 4px' }}>{title}</h1>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: '#0d1117',
            border: '1px solid #30363d',
            padding: '4px 8px',
            borderRadius: '8px',
            fontSize: '11px',
          }}
        >
          <div style={{ width: '8px', height: '8px', background: '#22c55e', borderRadius: '9999px' }} />
          在线 <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#86efac', fontWeight: 700 }}>{onlineCount}</span>
        </div>

        <button
          onClick={onClear}
          style={{
            flexShrink: 0,
            background: '#da3633',
            border: '1px solid rgba(248,81,73,0.4)',
            padding: '4px 8px',
            borderRadius: '8px',
            fontSize: '11px',
            fontWeight: 600,
            color: '#fff',
            cursor: 'pointer',
          }}
          title="清空全部记录"
        >
          清空全部
        </button>

        <button
          onClick={onDownloadCsv}
          style={{
            flexShrink: 0,
            background: '#21262d',
            border: '1px solid #30363d',
            padding: '4px 8px',
            borderRadius: '8px',
            fontSize: '11px',
            fontWeight: 600,
            color: '#d2dbe7',
            cursor: 'pointer',
          }}
        >
          下载CSV
        </button>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: '#0d1117',
            border: '1px solid #30363d',
            padding: '4px 8px',
            borderRadius: '8px',
            fontSize: '11px',
          }}
        >
          点击/进入{' '}
          <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#79c0ff', fontWeight: 700 }}>
            {clickRateLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
