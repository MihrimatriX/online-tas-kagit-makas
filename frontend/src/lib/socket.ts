import { io } from "socket.io-client";

// Same-origin prod (SERVE_FRONTEND=1) → empty VITE_SOCKET_URL uses window origin
const socketUrl =
  import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.PROD ? window.location.origin : "http://localhost:4000");

export const socket = io(socketUrl, {
  autoConnect: true,
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 5000
});
