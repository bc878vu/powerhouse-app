import { io } from "socket.io-client";

// Socket.IO is an optional enhancement. Task delivery is backed by API polling,
// Firestore notifications and FCM, so a broken or stale socket endpoint must
// never create reconnect noise or affect dashboard/notification functionality.
const SOCKET_URL = String(import.meta.env.VITE_SOCKET_URL || "").trim();
const SOCKET_ENABLED = String(import.meta.env.VITE_ENABLE_SOCKET || "").toLowerCase() === "true";

const noop = () => {};
const createNoopSocket = () => ({
  connected: false,
  emit: noop,
  on: noop,
  off: noop,
  once: noop,
  onAny: noop,
  offAny: noop,
});

export const socket = SOCKET_ENABLED && SOCKET_URL
  ? io(SOCKET_URL, {
      // Start with HTTP polling so deployments/proxies that do not upgrade
      // WebSockets still work. Socket.IO may upgrade when the server supports it.
      transports: ["polling", "websocket"],
      upgrade: true,
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.25,
      timeout: 8000,
    })
  : createNoopSocket();

if (SOCKET_ENABLED && SOCKET_URL) {
  socket.on("connect", () => console.info("PowerHouse realtime connected"));
  // Socket is optional: deliberately suppress connection errors here. Consumers
  // continue through API/FCM/Firestore fallbacks without flooding DevTools.
  socket.on("connect_error", () => {});
}
