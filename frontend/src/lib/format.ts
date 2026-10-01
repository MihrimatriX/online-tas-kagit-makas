import { ActivityFeedEvent, AdminAction, Move } from "../types";

export const moveLabels: Record<Move, string> = {
  rock: "Taş",
  paper: "Kağıt",
  scissors: "Makas"
};

export const MOVES: Move[] = ["rock", "paper", "scissors"];

export function formatClock(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

const STATUS_LABELS: Record<string, string> = {
  waiting: "Bekliyor",
  seeded: "Eşleşmeler hazır",
  active: "Sürüyor",
  paused: "Duraklatıldı",
  finished: "Bitti",
  locked: "Sırada",
  completed: "Bitti",
  playing: "Oynanıyor",
  walkover: "Hükmen"
};

export function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

export const feedTags: Record<ActivityFeedEvent["type"], string> = {
  phase_waiting: "Kura",
  phase_started: "Başladı",
  phase_paused: "Durdu",
  phase_resumed: "Devam",
  phase_completed: "Tur bitti",
  phase_advanced: "Sıradaki",
  round_result: "Round",
  match_finished: "Maç",
  match_draw_round: "Berabere",
  bye_advance: "BYE",
  tournament_winner: "Şampiyon",
  admin_action: "Lobi"
};

const ADMIN_ACTION_LABELS: Record<AdminAction["actionType"], string> = {
  TOURNAMENT_SEEDED: "Eşleşmeler çekildi",
  TOURNAMENT_UNSEEDED: "Eşleşmeler bozuldu",
  TOURNAMENT_STARTED: "Turnuva başladı",
  PHASE_PAUSED: "Duraklatıldı",
  PHASE_RESUMED: "Devam ettirildi",
  PHASE_COMPLETED: "Tur tamamlandı",
  PHASE_ADVANCED: "Sonraki tura geçildi",
  MATCH_RESTARTED: "Maç baştan başlatıldı",
  MATCH_WINNER_ASSIGNED: "Kazanan atandı",
  CHAMPION_CROWNED: "Şampiyon ilan edildi",
  PLAYER_KICKED: "Oyuncu çıkarıldı",
  FEED_CLEARED: "Akış temizlendi",
  ADMIN_TRANSFERRED: "Yönetim devredildi",
  ROOM_UPDATED: "Oda ayarı değişti"
};

export function adminActionLabel(type: AdminAction["actionType"]) {
  return ADMIN_ACTION_LABELS[type] ?? type;
}

export function joinUrl(code: string) {
  return `${window.location.origin}/?code=${code}`;
}

export function overlayUrl(code: string, chroma = false) {
  return `${window.location.origin}/overlay/${code}${chroma ? "?chroma=1" : ""}`;
}

export function readRoute() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const params = new URLSearchParams(window.location.search);
  const overlay = path.match(/^\/overlay\/([^/]+)$/i);
  return {
    overlayCode: overlay ? overlay[1].toUpperCase() : null,
    chroma: params.has("chroma"),
    joinCode: (params.get("code") ?? "").toUpperCase().slice(0, 8)
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
