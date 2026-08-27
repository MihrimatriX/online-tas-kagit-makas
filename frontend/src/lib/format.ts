import { ActivityFeedEvent, Lobby, Move, RoomSettings } from "../types";

export const moveLabels: Record<Move, string> = {
  rock: "Taş",
  paper: "Kağıt",
  scissors: "Makas"
};

export const moveShortLabels: Record<Move, string> = {
  rock: "✊",
  paper: "✋",
  scissors: "✌️"
};

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    waiting: "Bekliyor",
    seeded: "Eşleşmeler hazır",
    active: "Devam ediyor",
    paused: "Duraklatıldı",
    finished: "Bitti",
    locked: "Henüz açılmadı",
    completed: "Bitti",
    playing: "Oynanıyor",
    walkover: "Rakip ayrıldı"
  };
  return labels[status] ?? status;
}

export function feedTone(event: ActivityFeedEvent) {
  if (event.type.includes("winner")) return "gold";
  if (event.type.includes("completed") || event.type.includes("finished")) return "green";
  if (event.type.includes("paused")) return "orange";
  if (event.type.includes("advanced") || event.type.includes("resumed")) return "purple";
  if (event.type.includes("started")) return "blue";
  return "neutral";
}

export function joinUrl(code: string) {
  return `${window.location.origin}/?code=${code}`;
}

export function overlayUrl(code: string, chroma = false) {
  return `${window.location.origin}/overlay/${code}${chroma ? "?chroma=1" : ""}`;
}

export function roomSettings(lobby?: Pick<Lobby, "settings"> | null): RoomSettings {
  return {
    winningScore: lobby?.settings?.winningScore ?? 3,
    moveSeconds: lobby?.settings?.moveSeconds ?? 10,
    countdownSeconds: lobby?.settings?.countdownSeconds ?? 3,
    autoAdvance: Boolean(lobby?.settings?.autoAdvance)
  };
}

export function readRoute() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const params = new URLSearchParams(window.location.search);
  const overlay = path.match(/^\/overlay\/([^/]+)$/i);
  return {
    overlayCode: overlay ? overlay[1].toUpperCase() : null,
    chroma: params.has("chroma"),
    joinCode: (params.get("code") ?? "").toUpperCase()
  };
}

export async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
