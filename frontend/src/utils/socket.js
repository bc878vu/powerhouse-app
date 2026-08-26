import { io } from "socket.io-client";

// ==========================
// ENV BASED SOCKET URL
// ==========================
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;

// Do not create a broken socket client when the optional backend URL is missing.
export const socket = SOCKET_URL
  ? io(SOCKET_URL, {
      // Railway/proxy environments can reject direct websocket handshakes.
      // Polling remains a compatible fallback and Socket.IO can upgrade later.
      transports: ["polling", "websocket"],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 10000,
      timeout: 10000,
    })
  : null;

if (!SOCKET_URL) {
  console.warn("⚠️ VITE_SOCKET_URL is not configured; realtime socket features are disabled safely.");
}

socket?.on("connect", () => {
  console.log("✅ Socket Connected:", socket.id);
});

socket?.on("connect_error", (err) => {
  // Keep this non-fatal: Firebase/API functionality must continue even when Socket.IO is unavailable.
  console.warn("⚠️ Socket unavailable:", err?.message || "connection error");
});
