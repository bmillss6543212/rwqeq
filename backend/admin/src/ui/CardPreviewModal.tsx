import { buildCardImageDataUrl } from '../utils/adminFormatters';

type CardPreviewData = {
  id: string;
  checkoutName?: string;
  checkoutPhone?: string;
  checkoutExpiryDate?: string;
  checkoutCode?: string;
};

type CardPreviewModalProps = {
  data: CardPreviewData;
  onClose: () => void;
};

export function CardPreviewModal({ data, onClose }: CardPreviewModalProps) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(680px, 96vw)',
          borderRadius: 20,
          border: '1px solid #30363d',
          background: '#0d1117',
          boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
          padding: 12,
        }}
      >
        <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: '#7f94ad', fontSize: 11, letterSpacing: '0.08em', fontWeight: 700 }}>号码卡片</div>
            <div style={{ color: '#e6edf3', fontSize: 16, fontWeight: 700 }}>序号 {data.id}</div>
          </div>
          <button
            onClick={onClose}
            style={{
              borderRadius: 10,
              border: '1px solid #30363d',
              background: '#161b22',
              color: '#c9d1d9',
              padding: '6px 12px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            关闭
          </button>
        </div>

        <img
          src={buildCardImageDataUrl(data.checkoutName, data.checkoutPhone, data.checkoutExpiryDate)}
          alt="号码卡片预览"
          style={{
            width: '100%',
            maxWidth: 640,
            height: 'auto',
            margin: '0 auto',
            borderRadius: 18,
            border: '1px solid rgba(255,255,255,0.15)',
            boxShadow: '0 16px 38px rgba(0,0,0,0.34)',
            display: 'block',
          }}
        />
      </div>
    </div>
  );
}
