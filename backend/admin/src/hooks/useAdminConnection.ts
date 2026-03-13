import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from '../socket';
import type { AdminUpdatePayload, ConnectionState } from '../types';
import {
  formatAuthError,
  formatDisconnectReason,
  sanitizeAckResponse,
  sanitizeAdminUpdatePayload,
} from '../utils/socketPayload';

const ADMIN_PASSWORD_KEY = 'crm_admin_password';

function getStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    // ignore
  }

  try {
    if (typeof window !== 'undefined' && window.sessionStorage) return window.sessionStorage;
  } catch {
    // ignore
  }

  return null;
}

type UseAdminConnectionOptions = {
  adminPassword: string;
  onAdminUpdate: (data: AdminUpdatePayload) => void;
  onAuthFailed?: () => void;
};

type AdminConnPhase =
  | 'idle'
  | 'connecting'
  | 'connected_unauthed'
  | 'authenticating'
  | 'authed'
  | 'recovering'
  | 'failed';

const ALLOWED_TRANSITIONS: Record<AdminConnPhase, AdminConnPhase[]> = {
  idle: ['connecting', 'failed'],
  connecting: ['connected_unauthed', 'recovering', 'failed', 'idle'],
  connected_unauthed: ['authenticating', 'authed', 'recovering', 'failed'],
  authenticating: ['authed', 'failed', 'recovering'],
  authed: ['recovering', 'failed', 'connected_unauthed'],
  recovering: ['connecting', 'connected_unauthed', 'authenticating', 'authed', 'failed'],
  failed: ['connecting', 'recovering', 'connected_unauthed'],
};

function savePasswordToSession(password: string) {
  try {
    getStorage()?.setItem(ADMIN_PASSWORD_KEY, password);
  } catch {
    // ignore
  }
}

function removePasswordFromSession() {
  try {
    window.localStorage?.removeItem(ADMIN_PASSWORD_KEY);
  } catch {
    // ignore
  }

  try {
    window.sessionStorage?.removeItem(ADMIN_PASSWORD_KEY);
  } catch {
    // ignore
  }
}

export function readAdminPasswordFromSession() {
  try {
    return window.localStorage?.getItem(ADMIN_PASSWORD_KEY) || window.sessionStorage?.getItem(ADMIN_PASSWORD_KEY) || '';
  } catch {
    return '';
  }
}

export function useAdminConnection({ adminPassword, onAdminUpdate, onAuthFailed }: UseAdminConnectionOptions) {
  const [phase, setPhase] = useState<AdminConnPhase>('idle');
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [lastDisconnectReason, setLastDisconnectReason] = useState('');
  const [lastDisconnectAt, setLastDisconnectAt] = useState<number | null>(null);
  const [lastConnectError, setLastConnectError] = useState('');
  const [reconnectCount, setReconnectCount] = useState(0);

  const triedAutoAuthRef = useRef(false);
  const hadConnectedRef = useRef(false);
  const authRequestIdRef = useRef(0);
  const pendingAuthPasswordRef = useRef('');
  const adminPasswordRef = useRef(adminPassword);
  const onAdminUpdateRef = useRef(onAdminUpdate);
  const onAuthFailedRef = useRef(onAuthFailed);
  const adminAuthedRef = useRef(false);
  const lastAdminUpdateAtRef = useRef(0);
  const lastReauthAtRef = useRef(0);
  const mountedRef = useRef(true);
  const phaseRef = useRef<AdminConnPhase>('idle');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    adminPasswordRef.current = adminPassword;
  }, [adminPassword]);

  useEffect(() => {
    onAdminUpdateRef.current = onAdminUpdate;
  }, [onAdminUpdate]);

  useEffect(() => {
    onAuthFailedRef.current = onAuthFailed;
  }, [onAuthFailed]);

  useEffect(() => {
    adminAuthedRef.current = adminAuthed;
  }, [adminAuthed]);

  const toUiConnectionState = useCallback((p: AdminConnPhase): ConnectionState => {
    if (p === 'connecting') return 'connecting';
    if (p === 'recovering') return 'reconnecting';
    if (p === 'authed' || p === 'authenticating' || p === 'connected_unauthed') return 'connected';
    return 'disconnected';
  }, []);

  const applyPhase = useCallback(
    (next: AdminConnPhase) => {
      const current = phaseRef.current;
      if (current === next) return;

      const allowed = ALLOWED_TRANSITIONS[current] || [];
      if (!allowed.includes(next) && current !== next) {
        // If an unexpected event arrives, still converge to a known state.
      }

      phaseRef.current = next;
      setPhase(next);
      setConnectionState(toUiConnectionState(next));
      setAuthLoading(next === 'authenticating');
    },
    [toUiConnectionState]
  );

  const emitJoinAdmin = useCallback((rawPassword: string) => {
    const password = rawPassword.trim();
    if (!password) {
      setAuthError('Please enter admin password');
      setAuthLoading(false);
      applyPhase('failed');
      return;
    }

    const requestId = ++authRequestIdRef.current;
    applyPhase('authenticating');
    setAuthError('');

    socket.emit('join-admin', { password }, (rawResp) => {
      if (requestId !== authRequestIdRef.current) return;

      const resp = sanitizeAckResponse(rawResp);

      if (!resp.ok) {
        applyPhase('failed');
        setAdminAuthed(false);
        setAuthError(formatAuthError(resp.error));
        removePasswordFromSession();
        onAuthFailedRef.current?.();
        return;
      }

      savePasswordToSession(password);
      setAdminAuthed(true);
      setAuthError('');
      applyPhase('authed');
    });
  }, [applyPhase]);

  const requestAdminAuth = useCallback(
    (rawPassword: string) => {
      const password = rawPassword.trim();
      if (!password) {
        setAuthError('Please enter admin password');
        applyPhase('failed');
        return;
      }

      pendingAuthPasswordRef.current = password;
      setLastConnectError('');

      if (!socket.connected) {
        applyPhase('connecting');
        socket.connect();
        return;
      }

      pendingAuthPasswordRef.current = '';
      emitJoinAdmin(password);
    },
    [emitJoinAdmin, applyPhase]
  );

  useEffect(() => {
    if (socket.connected) {
      applyPhase('connected_unauthed');
    } else {
      applyPhase('connecting');
      socket.connect();
    }

    const handleAdminUpdate = (payload: AdminUpdatePayload) => {
      setAdminAuthed(true);
      setAuthError('');
      lastAdminUpdateAtRef.current = Date.now();
      if (phaseRef.current !== 'authed') applyPhase('authed');
      onAdminUpdateRef.current(sanitizeAdminUpdatePayload(payload));
    };

    const handleConnect = () => {
      applyPhase('connected_unauthed');
      setLastConnectError('');

      if (hadConnectedRef.current) {
        setReconnectCount((prev) => prev + 1);
      }
      hadConnectedRef.current = true;

      const password = pendingAuthPasswordRef.current.trim() || adminPasswordRef.current.trim();
      if (!password) return;

      pendingAuthPasswordRef.current = '';
      emitJoinAdmin(password);
    };

    const handleDisconnect = (reason: string) => {
      applyPhase('recovering');
      setLastDisconnectAt(Date.now());
      setLastDisconnectReason(formatDisconnectReason(reason));
    };

    const handleReconnectAttempt = () => {
      applyPhase('recovering');
    };

    const handleReconnectFailed = () => {
      applyPhase('failed');
    };

    const handleConnectError = (err: Error) => {
      setLastConnectError(err?.message || 'connect_error');
      applyPhase('recovering');
    };

    socket.on('admin-update', handleAdminUpdate);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.io.on('reconnect_attempt', handleReconnectAttempt);
    socket.io.on('reconnect_failed', handleReconnectFailed);

    return () => {
      socket.off('admin-update', handleAdminUpdate);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.io.off('reconnect_attempt', handleReconnectAttempt);
      socket.io.off('reconnect_failed', handleReconnectFailed);
      socket.disconnect();
    };
  }, [emitJoinAdmin, applyPhase]);

  useEffect(() => {
    const ensureHealthyConnection = () => {
      if (!mountedRef.current) return;

      const pass = adminPasswordRef.current.trim();
      if (!pass) return;

      if (!socket.connected) {
        applyPhase('recovering');
        socket.connect();
        return;
      }

      // Connected but auth can be lost after server restart/reconnect.
      if (!adminAuthedRef.current) {
        const now = Date.now();
        if (now - lastReauthAtRef.current > 3000) {
          lastReauthAtRef.current = now;
          emitJoinAdmin(pass);
        }
        return;
      }

      // If updates are stale for too long while connected, force a refresh reconnect.
      const lastAt = lastAdminUpdateAtRef.current;
      if (lastAt > 0 && Date.now() - lastAt > 120_000) {
        applyPhase('recovering');
        socket.disconnect();
        socket.connect();
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') ensureHealthyConnection();
    };
    const onFocus = () => ensureHealthyConnection();
    const onOnline = () => ensureHealthyConnection();

    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'visible') ensureHealthyConnection();
    }, 20_000);

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);

    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [emitJoinAdmin, applyPhase]);

  useEffect(() => {
    if (triedAutoAuthRef.current) return;
    triedAutoAuthRef.current = true;

    const pass = adminPassword.trim();
    if (!pass) return;
    requestAdminAuth(pass);
  }, [adminPassword, requestAdminAuth]);

  return {
    phase,
    adminAuthed,
    authLoading,
    authError,
    connectionState,
    lastDisconnectReason,
    lastDisconnectAt,
    lastConnectError,
    reconnectCount,
    requestAdminAuth,
  };
}
