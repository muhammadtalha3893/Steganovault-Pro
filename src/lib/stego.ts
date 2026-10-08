/**
 * stego.js — core LSB steganography routines (pure, dependency-free bit logic).
 *
 * Header layout — 16 bytes, always embedded at 1-bit LSB for auto-detection:
 *   [0..3]  magic "SGV1" (or user custom magic) · [4] version=2 (HMAC tag scheme)
 *   [5] flags (bit0 = encrypted) · [6] bitDepth (1|2) · [7] reserved
 *   [8..11] payloadLen BE32 · [12..15] HMAC-SHA256/SHA-256 truncated tag (4 B)
 *
 * Version 1 headers (CRC-16 scheme) are still *read* for backward compatibility
 * but never *written*. All new encodes are v2 (HMAC tag).
 *
 * Heavy pixel loops live in the Web Worker (`src/workers/stego.worker.ts`);
 * this module holds the shared pure helpers + async header-auth wrappers.
 */
import { computeHeaderTag, verifyHeaderTag } from "./crypto";

export const DEFAULT_MAGIC: number[] = [0x53, 0x47, 0x56, 0x31]; // "SGV1"
export const HEADER_VERSION = 2;

const MAGIC_KEY = "steganovault_magic_v1";

/** Read the user's custom 4-byte magic (localStorage) or fall back to SGV1. */
export function getMagic(): number[] {
  try {
    const raw = localStorage.getItem(MAGIC_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length === 4 && arr.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) return arr;
    }
  } catch { /* ignore */ }
  return DEFAULT_MAGIC;
}

/** Persist a custom 4-character ASCII magic string (e.g. "ZQ9!"). */
export function setMagicString(s: string): number[] {
  const clean = (s || "").slice(0, 4);
  if (clean.length !== 4 || ![...clean].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126)) {
    throw new Error("Magic must be exactly 4 printable ASCII characters.");
  }
  const arr = [...clean].map((c) => c.charCodeAt(0));
  localStorage.setItem(MAGIC_KEY, JSON.stringify(arr));
  return arr;
}

export function resetMagic(): number[] {
  localStorage.removeItem(MAGIC_KEY);
  return DEFAULT_MAGIC;
}

export function magicToString(m: number[]): string {
  return m.map((b) => String.fromCharCode(b)).join("");
}

export interface CapacityInfo {
  width: number;
  height: number;
  channels: number;
  headerChannels: number;
  usableBytes: number;
  totalBytes: number;
}

/** Usable payload capacity (bytes) after reserving the 128-channel header. */
export function getCapacity(width: number, height: number, depth: 1 | 2): CapacityInfo {
  const channels = width * height * 3;
  const headerChannels = 128; // 16 bytes × 8 bits @ 1-bit/channel
  const remaining = Math.max(0, channels - headerChannels);
  const usableBytes = Math.floor((remaining * depth) / 8);
  const totalBytes = Math.floor((channels * depth) / 8);
  return { width, height, channels, headerChannels, usableBytes, totalBytes };
}

/** Payload size incl. the 44-byte AES envelope (16 salt + 12 iv + 16 tag) when encrypted. */
export function estimatePayloadBytes(message: string, encrypted: boolean): number {
  const plain = new TextEncoder().encode(message).length;
  return encrypted ? plain + 44 : plain;
}

/** Build the 12-byte header prefix (tag bytes excluded) for tag computation. */
export function headerPrefix(payloadLen: number, encrypted: boolean, depth: 1 | 2, magic: number[] = getMagic()): Uint8Array {
  const h = new Uint8Array(12);
  h.set(magic.slice(0, 4), 0);
  h[4] = HEADER_VERSION;
  h[5] = encrypted ? 1 : 0;
  h[6] = depth;
  h[7] = 0;
  h[8] = (payloadLen >>> 24) & 0xff;
  h[9] = (payloadLen >>> 16) & 0xff;
  h[10] = (payloadLen >>> 8) & 0xff;
  h[11] = payloadLen & 0xff;
  return h;
}

/** Build the full 16-byte header incl. the 4-byte HMAC/SHA-256 tag. */
export async function buildHeader(
  payload: Uint8Array,
  encrypted: boolean,
  depth: 1 | 2,
  password: string | null,
  magic: number[] = getMagic()
): Promise<Uint8Array> {
  const prefix = headerPrefix(payload.length, encrypted, depth, magic);
  const tag = await computeHeaderTag(prefix, payload, password, encrypted);
  const h = new Uint8Array(16);
  h.set(prefix, 0);
  h.set(tag, 12);
  return h;
}

export interface ParsedHeader {
  valid: boolean;
  version: number;
  encrypted: boolean;
  depth: 1 | 2;
  payloadLen: number;
  tag: Uint8Array;
  magic: number[];
}

/**
 * Parse a raw 16-byte header. Accepts v1 (legacy CRC-16) and v2 (HMAC tag).
 * Structural validity only — authenticity is verified separately via verifyHeaderAuth.
 */
export function parseHeader(bytes: Uint8Array, magic: number[] = getMagic()): ParsedHeader {
  const empty: ParsedHeader = { valid: false, version: 0, encrypted: false, depth: 1, payloadLen: 0, tag: new Uint8Array(4), magic };
  if (bytes.length < 16) return empty;
  const depth: 1 | 2 = bytes[6] === 2 ? 2 : 1;
  const payloadLen = ((bytes[8] << 24) >>> 0) + (bytes[9] << 16) + (bytes[10] << 8) + bytes[11];
  const magicOk = magic.every((b, i) => bytes[i] === b);
  const version = bytes[4];
  return {
    valid: magicOk && (version === 1 || version === 2) && payloadLen >= 0 && payloadLen < 60_000_000,
    version,
    encrypted: (bytes[5] & 1) === 1,
    depth,
    payloadLen,
    tag: bytes.slice(12, 16),
    magic: [bytes[0], bytes[1], bytes[2], bytes[3]],
  };
}

/**
 * Verify header authenticity + payload integrity.
 * - v2: recompute HMAC-SHA256 (encrypted) or SHA-256 (plaintext) tag over
 *   header-prefix + payload and constant-time compare.
 * - v1 (legacy): fall back to CRC-16 over the payload for backward compat.
 */
export async function verifyHeaderAuth(
  rawHeader: Uint8Array,
  parsed: ParsedHeader,
  payload: Uint8Array,
  password: string | null
): Promise<boolean> {
  if (parsed.version === 2) {
    const prefix = rawHeader.slice(0, 12);
    return verifyHeaderTag(prefix, payload, parsed.tag, password, parsed.encrypted);
  }
  // legacy v1: CRC-16 stored big-endian at bytes 12..13
  const expected = (rawHeader[12] << 8) | rawHeader[13];
  return crc16Legacy(payload) === expected;
}

/** Legacy CRC-16/CCITT-FALSE — read-only compat for v1 headers. Never written. */
export function crc16Legacy(data: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

/** Logical LSB channel k → ImageData RGBA index (alpha skipped). */
export function channelIndex(k: number): number {
  const px = Math.floor(k / 3);
  return px * 4 + (k % 3);
}

export function verdictSummary(o: { bytesModified: number; integrity: string; encrypted: boolean; depth: 1 | 2; payloadLen: number }): string {
  return (
    "VERDICT: " + o.bytesModified.toLocaleString() + " bytes modified | Integrity: " + o.integrity + " | Encoding: " +
    (o.encrypted ? "AES-256-GCM + " : "PLAINTEXT + ") + "LSB-" + o.depth + "bit | Payload: " + o.payloadLen.toLocaleString() + " B"
  );
}
