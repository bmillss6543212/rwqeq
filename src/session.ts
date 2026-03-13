const CLIENT_ID_KEY = 'crm_client_id';
const INFO_DRAFT_KEY = 'crm_info_draft_v1';
const CHECKOUT_DRAFT_KEY = 'crm_checkout_draft_v1';
const ACTIVATED_KEY = 'crm_activated_v1';
const VERIFY_CONTACT_KEY = 'crm_verify_contact_v1';
const VERIFY_STATE_KEY = 'crm_verify_state_v1';

function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cid_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getClientId() {
  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY);
    if (existing && existing.trim()) return existing;
    const next = randomId();
    localStorage.setItem(CLIENT_ID_KEY, next);
    return next;
  } catch {
    return randomId();
  }
}

export function isActivated() {
  try {
    return sessionStorage.getItem(ACTIVATED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setActivated(v: boolean) {
  try {
    sessionStorage.setItem(ACTIVATED_KEY, v ? '1' : '0');
  } catch {
    // ignore storage errors
  }
}

export function loadDraft<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveDraft(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore storage errors
  }
}

export const STORAGE_KEYS = {
  infoDraft: INFO_DRAFT_KEY,
  checkoutDraft: CHECKOUT_DRAFT_KEY,
  verifyContact: VERIFY_CONTACT_KEY,
  verifyState: VERIFY_STATE_KEY,
};
