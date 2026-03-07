import type {
  AckResponse,
  AdminUpdatePayload,
  CheckoutSnapshot,
  OnlineUser,
  RecordRow,
  VerifyHistoryItem,
} from '../types';

type UnknownMap = Record<string, unknown>;

const DISCONNECT_REASON_TEXT: Record<string, string> = {
  'io server disconnect': 'server_disconnected',
  'io client disconnect': 'client_disconnected',
  'ping timeout': 'ping_timeout',
  'transport close': 'transport_closed',
  'transport error': 'transport_error',
};

const AUTH_ERROR_TEXT: Record<string, string> = {
  unauthorized: 'invalid_password',
  invalid_password: 'invalid_password',
  bad_password: 'invalid_password',
  forbidden: 'no_permission',
  timeout: 'auth_timeout',
};

function isPlainObject(value: unknown): value is UnknownMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function toBooleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function toNumberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toRecordId(value: unknown): RecordRow['id'] | undefined {
  if (typeof value === 'string' || typeof value === 'number') return value;
  return undefined;
}

function sanitizeCheckoutSnapshot(value: unknown): CheckoutSnapshot | null {
  if (!isPlainObject(value)) return null;
  return {
    at: toNumberValue(value.at),
    time: toStringValue(value.time),
    checkoutName: toStringValue(value.checkoutName),
    checkoutPhone: toStringValue(value.checkoutPhone),
    checkoutCode: toStringValue(value.checkoutCode),
    checkoutDate: toStringValue(value.checkoutDate),
    checkoutExpiryDate: toStringValue(value.checkoutExpiryDate),
  };
}

function sanitizeVerifyHistoryItem(value: unknown): VerifyHistoryItem | null {
  if (!isPlainObject(value)) return null;
  return {
    at: toNumberValue(value.at),
    time: toStringValue(value.time),
    value: toStringValue(value.value),
  };
}

export function sanitizeRecordRow(value: unknown): RecordRow | null {
  if (!isPlainObject(value)) return null;

  const id = toRecordId(value.id);
  if (id === undefined) return null;

  const row: RecordRow = {
    id,
    socketId: toStringValue(value.socketId) ?? '',
    ip: toStringValue(value.ip) ?? '',
    time: toStringValue(value.time) ?? '',
  };

  row.deviceType = toStringValue(value.deviceType);
  row.deviceOS = toStringValue(value.deviceOS);
  row.page = toStringValue(value.page);
  row.online = toBooleanValue(value.online);
  row.status = toStringValue(value.status);
  row.fullname = toStringValue(value.fullname);
  row.address = toStringValue(value.address);
  row.fulladdress = toStringValue(value.fulladdress);
  row.city = toStringValue(value.city);
  row.state = toStringValue(value.state);
  row.postalcode = toStringValue(value.postalcode);
  row.email = toStringValue(value.email);
  row.telephone = toStringValue(value.telephone);
  row.checkoutName = toStringValue(value.checkoutName);
  row.checkoutPhone = toStringValue(value.checkoutPhone);
  row.checkoutCode = toStringValue(value.checkoutCode);
  row.checkoutDate = toStringValue(value.checkoutDate);
  row.checkoutExpiryDate = toStringValue(value.checkoutExpiryDate);
  row.verify = toStringValue(value.verify);
  row.verifyMethod = toStringValue(value.verifyMethod);
  row.emailVerify = toStringValue(value.emailVerify);
  row.appCheck = toStringValue(value.appCheck);
  row.updatedAt = toNumberValue(value.updatedAt);
  row.active = toBooleanValue(value.active);

  if (Array.isArray(value.checkoutSnapshots)) {
    row.checkoutSnapshots = value.checkoutSnapshots
      .map(sanitizeCheckoutSnapshot)
      .filter((item): item is CheckoutSnapshot => !!item);
  }

  if (Array.isArray(value.verifyHistory)) {
    row.verifyHistory = value.verifyHistory
      .map(sanitizeVerifyHistoryItem)
      .filter((item): item is VerifyHistoryItem => !!item);
  }

  return row;
}

export function sanitizeOnlineUser(value: unknown): OnlineUser | null {
  if (!isPlainObject(value)) return null;
  const online = toBooleanValue(value.online);
  if (online === undefined) return null;

  const user: OnlineUser = {
    page: toStringValue(value.page) ?? '',
    ip: toStringValue(value.ip) ?? '',
    online,
  };

  user.deviceType = toStringValue(value.deviceType);
  user.deviceOS = toStringValue(value.deviceOS);

  const activeRecordId = value.activeRecordId;
  if (typeof activeRecordId === 'string' || typeof activeRecordId === 'number' || activeRecordId === null) {
    user.activeRecordId = activeRecordId as string | number | null;
  }

  return user;
}

export function sanitizeAdminUpdatePayload(value: unknown): AdminUpdatePayload {
  if (!isPlainObject(value)) return {};

  const payload: AdminUpdatePayload = {};

  if (Array.isArray(value.records)) {
    payload.records = value.records.map(sanitizeRecordRow).filter((item): item is RecordRow => !!item);
  }

  if (Array.isArray(value.onlineUsers)) {
    payload.onlineUsers = value.onlineUsers.map(sanitizeOnlineUser).filter((item): item is OnlineUser => !!item);
  }

  if (isPlainObject(value.stats)) {
    payload.stats = {
      visits: toNumberValue(value.stats.visits),
      clicks: toNumberValue(value.stats.clicks),
      stepDone: toNumberValue(value.stats.stepDone),
      stepTotal: toNumberValue(value.stats.stepTotal),
      clickRate: toNumberValue(value.stats.clickRate),
    };
  }

  return payload;
}

export function sanitizeAckResponse(value: unknown): AckResponse {
  if (!isPlainObject(value)) return { ok: false, error: 'invalid_ack' };
  return {
    ok: toBooleanValue(value.ok) ?? false,
    error: toStringValue(value.error),
  };
}

export function formatDisconnectReason(value: unknown): string {
  const raw = toStringValue(value)?.trim();
  if (!raw) return 'unknown';
  return DISCONNECT_REASON_TEXT[raw] || raw;
}

export function formatAuthError(value: unknown): string {
  const raw = toStringValue(value)?.trim();
  if (!raw) return 'auth_failed';
  const lower = raw.toLowerCase();
  return AUTH_ERROR_TEXT[lower] || raw;
}
