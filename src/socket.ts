import { io } from 'socket.io-client';

const URL =
  import.meta.env.VITE_SOCKET_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD
    ? 'https://cnjsdnsja-production.up.railway.app'
    : 'http://localhost:3000');

export const socket = io(URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1200,
  reconnectionDelayMax: 5000,
  timeout: 8000,
  transports: ['websocket', 'polling'],
  forceNew: true,
  upgrade: true,
});
