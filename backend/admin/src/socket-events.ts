import type { AckResponse, AdminUpdatePayload, RouteTarget } from './types';

export type ServerToClientEvents = {
  'admin-update': (data: AdminUpdatePayload) => void;
};

export type ClientToServerEvents = {
  'join-admin': (payload: { password: string }, ack: (resp: AckResponse) => void) => void;
  'admin-clear-all': (payload: Record<string, never>, ack?: (resp: AckResponse) => void) => void;
  'request-refill': (payload: { socketId: string; reason: string }, ack?: (resp: AckResponse) => void) => void;
  'request-checkout-refill': (
    payload: { socketId: string; recordId: number | string; reason?: string },
    ack?: (resp: AckResponse) => void
  ) => void;
  'admin-route-user': (
    payload: { socketId: string; target: RouteTarget; reason?: string },
    ack?: (resp: AckResponse) => void
  ) => void;
  'admin-route-url': (payload: { socketId: string; reason?: string }, ack?: (resp: AckResponse) => void) => void;
};
