import { useEffect, useRef } from 'react';
import { socket } from '../socket';
import { isActivated } from '../session';

export const useCurrentPage = (pageName: string) => {
  const joinedRef = useRef(false);

  useEffect(() => {
    if (!pageName) return;
    if (!isActivated()) return;

    // Ensure the socket is connected before page events are emitted.
    if (!socket.connected) {
      socket.connect();
    }

    const joinPage = () => {
      // Prevent duplicate join events in StrictMode or after re-renders.
      if (joinedRef.current) return;
      joinedRef.current = true;

      socket.emit('join-page', pageName);
      console.log(`[Page] Joined page: ${pageName}`);
    };

    const leavePage = (reason = 'unmount') => {
      if (!joinedRef.current) return;
      joinedRef.current = false;

      socket.emit('leave-page', { page: pageName, reason });
      console.log(`[Page] Left page: ${pageName} (${reason})`);
    };

    // Join immediately on first entry.
    joinPage();

    // Re-join after reconnects so the backend has the current page again.
    const onConnect = () => {
      joinedRef.current = false;
      joinPage();
    };

    socket.on('connect', onConnect);
    // socket.io-client v4 may not always fire "reconnect", but keeping this is harmless.
    socket.io?.on?.('reconnect', onConnect);

    // Report when the page is backgrounded or restored.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        leavePage('hidden');
      } else if (document.visibilityState === 'visible') {
        joinPage();
      }
    };

    // Best-effort reporting for refresh or tab close.
    const onBeforeUnload = () => {
      leavePage('beforeunload');
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      socket.off('connect', onConnect);
      socket.io?.off?.('reconnect', onConnect);

      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('beforeunload', onBeforeUnload);

      leavePage('unmount');
    };
  }, [pageName]);
};
