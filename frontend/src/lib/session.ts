import { SessionState } from "../types";

// localStorage (not sessionStorage) so a closed tab or a killed mobile browser can rejoin.
// A second tab with the same session takes over; the server tells the first one.
const KEY = "rps_session";

export function loadSession(): SessionState | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "null") as SessionState | null;
    return parsed?.playerId && parsed.lobbyCode && parsed.reconnectToken ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(session: SessionState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Private mode: the session simply won't survive a reload.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
