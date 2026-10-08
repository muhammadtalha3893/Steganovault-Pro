/**
 * stegoClient.ts — main-thread façade over the Web Worker pixel engine.
 * Falls back to chunked main-thread loops if Workers are unavailable.
 * Header auth (HMAC/SHA-256) + crypto stay in `crypto.ts` / `stego.ts`.
 */
import { buildHeader, parseHeader, verifyHeaderAuth, channelIndex, crc16Legacy, getMagic } from "./stego";

export interface WorkerEncodeResult {
  imageData: ImageData;
  bytesModified: number;
  payloadLen: number;
  header: Uint8Array;
  payload: Uint8Array;
}

export interface WorkerDecodeResult {
  header: ReturnType<typeof parseHeader>;
  rawHeader: Uint8Array;
  payload: Uint8Array;
  authOk: boolean;
  channelsUsed: number;
}

let worker: Worker | null = null;
let seq = 1;

function getWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  try {
    if (!worker) {
      worker = new Worker(new URL("../workers/stego.worker.ts", import.meta.url), { type: "module" });
    }
    return worker;
  } catch {
    return null;
  }
}

interface Pending {
  resolve: (v: never) => void;
  reject: (e: Error) => void;
  onProgress?: (p: number) => void;
  kind: "encode" | "decode";
  // decode context for auth on completion
  password?: string | null;
  magic?: number[];
}

const pending = new Map<number, Pending>();
let wired = false;

function wire(w: Worker) {
  if (wired) return;
  wired = true;
  w.onmessage = (ev: MessageEvent) => {
    const m = ev.data as { type: string; id: number; value?: number; rgba?: ArrayBuffer; bytesModified?: number; header?: ArrayBuffer; payload?: ArrayBuffer; channelsUsed?: number; message?: string };
    const p = pending.get(m.id);
    if (!p) return;
    if (m.type === "progress") {
      p.onProgress?.(m.value ?? 0);
      return;
    }
    pending.delete(m.id);
    if (m.type === "error") {
      p.reject(new Error(m.message || "Processing failed."));
      return;
    }
    if (m.type === "encode-done" && p.kind === "encode") {
      const ctx = p as Pending & { width: number; height: number; header: Uint8Array; payload: Uint8Array };
      const rgba = new Uint8ClampedArray(m.rgba!);
      p.resolve({ imageData: new ImageData(rgba, ctx.width, ctx.height), bytesModified: m.bytesModified ?? 0, payloadLen: ctx.payload.length, header: ctx.header, payload: ctx.payload } as never);
      return;
    }
    if (m.type === "decode-done" && p.kind === "decode") {
      const rawHeader = new Uint8Array(m.header!);
      const payload = new Uint8Array(m.payload!);
      const magic = (p as Pending & { magic?: number[] }).magic ?? getMagic();
      const header = parseHeader(rawHeader, magic);
      if (!header.valid) {
        p.reject(new Error("Image appears corrupted or not encoded with StegoVault."));
        return;
      }
      // Auth (HMAC v2 / CRC-16 legacy v1) is async — resolve via promise chain.
      const pw = (p as Pending & { password?: string | null }).password ?? null;
      verifyHeaderAuth(rawHeader, header, payload, pw).then((authOk) => {
        p.resolve({ header, rawHeader, payload, authOk, channelsUsed: m.channelsUsed ?? 0 } as never);
      }).catch((e: unknown) => p.reject(e instanceof Error ? e : new Error("Image appears corrupted or not encoded with StegoVault.")));
      return;
    }
  };
}

/**
 * Encode a payload into a copy of `src` inside the Worker.
 * Computes the v2 HMAC-tagged header on the main thread first (needs Web Crypto).
 */
export function encodeInWorker(
  src: ImageData,
  payload: Uint8Array,
  depth: 1 | 2,
  encrypted: boolean,
  password: string | null,
  onProgress?: (p: number) => void
): Promise<WorkerEncodeResult> {
  return (async () => {
    const header = await buildHeader(payload, encrypted, depth, password);
    const w = getWorker();
    if (!w) return encodeMainThread(src, payload, depth, header, onProgress);
    wire(w);
    const id = seq++;
    const srcCopy = new Uint8ClampedArray(src.data);
    const payloadCopy = new Uint8Array(payload);
    const headerCopy = new Uint8Array(header);
    return new Promise<WorkerEncodeResult>((resolve, reject) => {
      pending.set(id, Object.assign({ resolve: resolve as (v: never) => void, reject, onProgress, kind: "encode" as const }, { width: src.width, height: src.height, header: headerCopy, payload: payloadCopy }));
      try {
        w.postMessage(
          { type: "encode", id, width: src.width, height: src.height, src: srcCopy.buffer, payload: payloadCopy.buffer, header: headerCopy.buffer, depth },
          [srcCopy.buffer, payloadCopy.buffer, headerCopy.buffer]
        );
      } catch (e) {
        pending.delete(id);
        reject(e instanceof Error ? e : new Error("Worker post failed."));
      }
    });
  })();
}

/**
 * Decode: worker extracts raw header + payload; main thread verifies HMAC/SHA-256 tag.
 * For encrypted payloads, pass the password so the HMAC check can run immediately;
 * pass null first to probe the header flags, then re-verify after prompting.
 */
export function decodeInWorker(
  src: ImageData,
  opts: { password?: string | null; magic?: number[] },
  onProgress?: (p: number) => void
): Promise<WorkerDecodeResult> {
  const w = getWorker();
  if (!w) return decodeMainThread(src, opts, onProgress);
  wire(w);
  const id = seq++;
  const copy = new Uint8ClampedArray(src.data);
  return new Promise<WorkerDecodeResult>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: never) => void, reject, onProgress, kind: "decode", password: opts.password ?? null, magic: opts.magic ?? getMagic() });
    try {
      w.postMessage({ type: "decode", id, width: src.width, height: src.height, rgba: copy.buffer }, [copy.buffer]);
    } catch (e) {
      pending.delete(id);
      reject(e instanceof Error ? e : new Error("Worker post failed."));
    }
  });
}

// ---------- main-thread fallback (chunked, non-blocking) ----------

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

async function encodeMainThread(
  src: ImageData, payload: Uint8Array, depth: 1 | 2, header: Uint8Array, onProgress?: (p: number) => void
): Promise<WorkerEncodeResult> {
  const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
  const d = out.data;
  const channels = src.width * src.height * 3;
  for (let i = 0; i < 128; i++) {
    d[channelIndex(i)] = (d[channelIndex(i)] & 0xfe) | ((header[i >> 3] >> (7 - (i % 8))) & 1);
  }
  onProgress?.(0.15);
  await tick();
  const needed = Math.ceil((payload.length * 8) / depth);
  if (128 + needed > channels) throw new Error("Your payload is too large. Reduce the message size or increase bit depth.");
  const mask = depth === 1 ? 0xfe : 0xfc;
  let bitPos = 0;
  for (let k = 0; k < needed; k++) {
    let chunk = 0;
    for (let b = 0; b < depth; b++) {
      const byteIdx = Math.floor(bitPos / 8);
      chunk = (chunk << 1) | (byteIdx < payload.length ? (payload[byteIdx] >> (7 - (bitPos % 8))) & 1 : 0);
      bitPos++;
    }
    d[channelIndex(128 + k)] = (d[channelIndex(128 + k)] & mask) | chunk;
    if (k % 8000 === 0) { onProgress?.(0.15 + (k / needed) * 0.78); await tick(); }
  }
  onProgress?.(1);
  let modified = 0; const step = Math.max(1, Math.floor(d.length / 20000)); let samples = 0;
  for (let i = 0; i < d.length; i += step) { samples++; if (d[i] !== src.data[i]) modified++; }
  return { imageData: out, bytesModified: Math.round((modified / samples) * d.length), payloadLen: payload.length, header, payload };
}

/** Unified single-pass extraction with a `depth` parameter (no duplicate tries). */
async function decodeMainThread(
  src: ImageData, opts: { password?: string | null; magic?: number[] }, onProgress?: (p: number) => void
): Promise<WorkerDecodeResult> {
  const magic = opts.magic ?? getMagic();
  const d = src.data;
  const channels = src.width * src.height * 3;
  if (channels < 256) throw new Error("Image appears corrupted or not encoded with StegoVault.");
  const hb = new Uint8Array(16);
  for (let i = 0; i < 128; i++) {
    hb[i >> 3] = (hb[i >> 3] << 1) | (d[channelIndex(i)] & 1);
    if (i % 64 === 0) await tick();
  }
  onProgress?.(0.2);
  const header = parseHeader(hb, magic);
  if (!header.valid) throw new Error("Image appears corrupted or not encoded with StegoVault.");
  const needed = Math.ceil((header.payloadLen * 8) / header.depth);
  if (128 + needed > channels) throw new Error("Image appears corrupted or not encoded with StegoVault.");
  const payload = new Uint8Array(header.payloadLen);
  const out = await extractBits(d, header.payloadLen, header.depth, onProgress);
  payload.set(out);
  onProgress?.(1);
  const rawHeader = hb;
  const authOk = await verifyHeaderAuth(rawHeader, header, payload, opts.password ?? null);
  return { header, rawHeader, payload, authOk, channelsUsed: 128 + needed };
}

/**
 * Unified bit-extraction routine — single pass parameterized by `depth`.
 * Replaces the old duplicate 1-bit/2-bit retry logic.
 */
export async function extractBits(
  rgba: ArrayLike<number>, payloadLen: number, depth: 1 | 2, onProgress?: (p: number) => void
): Promise<Uint8Array> {
  const payload = new Uint8Array(payloadLen);
  const needed = Math.ceil((payloadLen * 8) / depth);
  let bitPos = 0;
  for (let k = 0; k < needed; k++) {
    const idx = channelIndex(128 + k);
    const chunk = depth === 1 ? (rgba[idx] as number) & 1 : (rgba[idx] as number) & 3;
    for (let b = depth - 1; b >= 0; b--) {
      if (bitPos >= payloadLen * 8) break;
      const byteIdx = Math.floor(bitPos / 8);
      payload[byteIdx] = (payload[byteIdx] << 1) | ((chunk >> b) & 1);
      bitPos++;
    }
    if (k % 8000 === 0) { onProgress?.(0.2 + (k / Math.max(1, needed)) * 0.7); await tick(); }
  }
  return payload;
}

export { crc16Legacy };
