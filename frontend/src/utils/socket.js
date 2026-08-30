import { io } from "socket.io-client";

// Realtime is optional. The dashboard already has API polling, so a missing or
// unreachable socket endpoint must never create browser console noise or break UI.
const SOCKET_URL = String(import.meta.env.VITE_SOCKET_URL || "").trim();
const SOCKET_ENABLED = String(import.meta.env.VITE_SOCKET_ENABLED || "").toLowerCase() === "true";
const VALID_SOCKET_URL = /^https?:\/\//i.test(SOCKET_URL);

const createNoopSocket = () => ({
  id: undefined,
  connected: false,
  on: () => undefined,
  off: () => undefined,
  emit: () => undefined,
});

export const socket = SOCKET_ENABLED && VALID_SOCKET_URL
  ? io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 2,
      reconnectionDelay: 2500,
      reconnectionDelayMax: 6000,
      timeout: 8000,
    })
  : createNoopSocket();

// Socket errors are intentionally silent because realtime is an enhancement;
// the dashboard remains live through its existing API refresh cycle.
socket.on("connect_error", () => undefined);
