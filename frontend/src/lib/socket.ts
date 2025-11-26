import { io, type Socket } from "socket.io-client";
import { API_BASE_URL } from "../api/client";

function deriveDefaultSocketUrl() {
  const fallback = "http://localhost:4000";
  try {
    const apiUrl = new URL(API_BASE_URL);
    if (apiUrl.pathname.endsWith("/api")) {
      apiUrl.pathname = apiUrl.pathname.replace(/\/api$/, "");
    }
    if (apiUrl.pathname === "") {
      apiUrl.pathname = "/";
    }
    return apiUrl.origin + apiUrl.pathname.replace(/\/$/, "");
  } catch (error) {
    console.warn("Failed to derive socket URL from API base", error);
    return fallback;
  }
}

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? deriveDefaultSocketUrl();

let cachedSocket: Socket | null = null;

export function getSocket(): Socket {
  if (cachedSocket && cachedSocket.connected) {
    return cachedSocket;
  }
  if (!cachedSocket) {
    cachedSocket = io(SOCKET_URL, {
      autoConnect: false,
      withCredentials: true,
    });
  }
  if (!cachedSocket.connected) {
    cachedSocket.connect();
  }
  return cachedSocket;
}

export function disconnectSocket() {
  if (cachedSocket) {
    cachedSocket.disconnect();
  }
}
