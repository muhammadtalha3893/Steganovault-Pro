/**
 * hex.ts — hex-dump helpers.
 * Dumps are capped (default 1024 B) with incremental "load more" expansion
 * so huge images never freeze the UI.
 */

export interface HexLineData {
  offset: number;
  bytes: { value: string; hot: boolean }[];
  ascii: string;
}

/** Build hex lines for [start, start+count) with hot-byte highlighting. */
export function hexSlice(
  orig: ArrayLike<number>,
  stego: ArrayLike<number>,
  start: number,
  count: number
): { lines: HexLineData[]; hotCount: number } {
  const n = Math.min(start + count, orig.length, stego.length);
  const lines: HexLineData[] = [];
  let hotCount = 0;
  const aligned = Math.floor(start / 16) * 16;
  for (let off = aligned; off < n; off += 16) {
    const bytes: HexLineData["bytes"] = [];
    let ascii = "";
    for (let i = 0; i < 16 && off + i < n; i++) {
      if (off + i < start) continue;
      const v = stego[off + i] as number;
      const hot = v !== (orig[off + i] as number);
      if (hot) hotCount++;
      bytes.push({ value: v.toString(16).padStart(2, "0"), hot });
      ascii += v >= 32 && v < 127 ? String.fromCharCode(v) : ".";
    }
    if (bytes.length > 0) lines.push({ offset: off, bytes, ascii });
  }
  return { lines, hotCount };
}

export const HEX_PAGE = 1024; // bytes per "Load more" page

/** Serialize lines for HistoryEntry storage (plain JSON-safe). */
export function toStored(lines: HexLineData[]): { offset: number; hex: string[]; hot: boolean[]; ascii: string }[] {
  return lines.map((l) => ({ offset: l.offset, hex: l.bytes.map((b) => b.value), hot: l.bytes.map((b) => b.hot), ascii: l.ascii }));
}

/** Load + draw an image file to a lossless canvas (capped dimension). */
export function loadImageFile(file: File): Promise<{ img: HTMLImageElement; objectUrl: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, objectUrl: url });
    img.onerror = () => reject(new Error("Could not decode that image file."));
    img.src = url;
  });
}

export function drawToCanvas(img: HTMLImageElement, maxDim = 1600): HTMLCanvasElement {
  const w0 = img.naturalWidth;
  const h0 = img.naturalHeight;
  const scale = Math.min(1, maxDim / Math.max(w0, h0));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w0 * scale));
  c.height = Math.max(1, Math.round(h0 * scale));
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/** Downscale a data URL to a small PNG thumbnail for history storage. */
export function makeThumbnail(dataUrl: string, size = 144): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      const scale = Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight));
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => resolve(dataUrl.slice(0, 60000));
    img.src = dataUrl;
  });
}

/**
 * Sanitize user-supplied text for safe display.
 * NOTE: React already escapes text nodes; this additionally strips control
 * characters that could confuse forensic views. Never use innerHTML with it.
 */
export function sanitizeText(s: string, max = 8000): string {
  return String(s ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .slice(0, max);
}

/** Sanitize a filename for display (strip path separators + controls). */
export function sanitizeFilename(name: string): string {
  return String(name ?? "image.png")
    .replace(/[\\/]/g, "_")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .slice(0, 120) || "image.png";
}
