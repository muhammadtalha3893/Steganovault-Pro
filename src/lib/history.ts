// History persistence — localStorage only. All rendering uses React text
// nodes (auto-escaped); never inject entry fields via innerHTML.
export type ActionType = "encode" | "decode";
export type StatusType = "success" | "failed" | "corrupted";

export interface HistoryEntry {
  id: string;
  action: ActionType;
  timestamp: number;
  filename: string;
  status: StatusType;
  messagePreview: string;
  fullMessage: string;
  bitDepth: 1 | 2;
  encrypted: boolean;
  payloadBytes: number;
  capacityBytes: number;
  imageW: number;
  imageH: number;
  sha256: string;
  hexVerdict: string;
  verdictSummary: string;
  thumbnail: string;
  hexLines: { offset: number; hex: string[]; hot: boolean[]; ascii: string }[];
  hexTotal?: number;
  authScheme?: string;
}

const KEY = "steganovault_history_v1";

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveHistory(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, 60)));
  } catch {
    try {
      const slim = entries.slice(0, 60).map((e) => ({ ...e, thumbnail: "", hexLines: [] }));
      localStorage.setItem(KEY, JSON.stringify(slim));
    } catch {
      /* quota */
    }
  }
}

export function uid(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

export function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return s + "s ago";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  const d = Math.floor(h / 24);
  if (d < 30) return d + "d ago";
  return new Date(ts).toLocaleDateString();
}

/** Export a single entry's metadata + message as a structured JSON file. */
export function downloadEntryJSON(e: HistoryEntry): void {
  const doc = {
    app: "SteganoVault Pro",
    exportedAt: new Date().toISOString(),
    id: e.id,
    action: e.action,
    timestamp: new Date(e.timestamp).toISOString(),
    filename: e.filename,
    status: e.status,
    bitDepth: e.bitDepth,
    encrypted: e.encrypted,
    authScheme: e.authScheme || "HMAC-SHA256-32",
    payloadBytes: e.payloadBytes,
    capacityBytes: e.capacityBytes,
    dimensions: { width: e.imageW, height: e.imageH },
    sha256: e.sha256,
    hexVerdict: e.hexVerdict,
    verdictSummary: e.verdictSummary,
    message: e.fullMessage,
  };
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `steganovault-${e.action}-${e.id.slice(0, 8)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
