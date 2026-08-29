import { io } from "socket.io-client";

// Optional realtime channel. Firebase/FCM features remain independent.
const SOCKET_URL = String(import.meta.env.VITE_SOCKET_URL || "").trim();

const noop = () => {};

// Keep consumers safe when realtime is not configured instead of allowing
// dashboard/task listeners to throw on socket.emit/on calls.
const createNoopSocket = () => ({
  connected: false,
  emit: noop,
  on: noop,
  off: noop,
  once: noop,
});

export const socket = SOCKET_URL
  ? io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.25,
      timeout: 8000,
    })
  : createNoopSocket();

if (!SOCKET_URL) {
  console.info(
    "PowerHouse realtime socket is not configured; task views will continue using their API refresh fallback."
  );
}

socket.on("connect", () =>
  console.info("PowerHouse realtime connected")
);

socket.on("connect_error", () => {
  // Optional realtime failure is non-fatal; Socket.IO keeps reconnecting.
});
