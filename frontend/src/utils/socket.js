import { io } from "socket.io-client";

// ==========================
// 🔥 ENV BASED SOCKET URL
// ==========================
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;

console.log("🔥 SOCKET URL:", SOCKET_URL);

// ❌ safety check
if (!SOCKET_URL) {
  console.error("❌ VITE_SOCKET_URL missing in .env");
}

// ==========================
// 🔥 SOCKET CONNECTION
// ==========================
export const socket = io(SOCKET_URL, {
  transports: ["websocket"],
  withCredentials: true,
  reconnection: true,
});

// ==========================
// 🔥 OPTIONAL DEBUG
// ==========================
socket.on("connect", () => {
  console.log("✅ Socket Connected:", socket.id);
});

socket.on("connect_error", (err) => {
  console.error("❌ Socket Error:", err.message);
});