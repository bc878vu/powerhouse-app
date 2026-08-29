import { io } from "socket.io-client";

// Optional realtime channel. Firebase/FCM features remain independent.
const SOCKET_URL=String(import.meta.env.VITE_SOCKET_URL||"").trim();
export const socket=SOCKET_URL?io(SOCKET_URL,{transports:["websocket"],withCredentials:true,reconnection:true,reconnectionAttempts:3,reconnectionDelay:2500,reconnectionDelayMax:8000,timeout:8000}):null;
if(!SOCKET_URL)console.info("PowerHouse realtime socket is not configured; Firebase realtime services continue normally.");
socket?.on("connect",()=>console.info("PowerHouse realtime connected"));
socket?.on("connect_error",()=>{/* optional socket failure is intentionally non-fatal and silent */});
