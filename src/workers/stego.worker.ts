/**
 * stego.worker.ts — Web Worker: heavy LSB pixel loops run off the main thread.
 *
 * Messages in:
 *   { type: "encode", id, width, height, src: ArrayBuffer(plain RGBA bytes),
 *     payload: ArrayBuffer, header: ArrayBuffer(16), depth: 1|2 }
 *   { type: "decode", id, width, height, rgba: ArrayBuffer }
 *
 * Messages out:
 *   { type: "progress", id, value }
 *   { type: "encode-done", id, rgba: ArrayBuffer, bytesModified }
 *   { type: "decode-done", id, header: ArrayBuffer(16), payload: ArrayBuffer, channelsUsed }
 *   { type: "error", id, message }
 *
 * The worker is dependency-free (pure bit manipulation). Header *auth*
 * (HMAC/SHA-256) stays on the main thread where Web Crypto lives.
 */

type InMsg =
  | { type: "encode"; id: number; width: number; height: number; src: ArrayBuffer; payload: ArrayBuffer; header: ArrayBuffer; depth: 1 | 2 }
  | { type: "decode"; id: number; width: number; height: number; rgba: ArrayBuffer };

function channelIndex(k: number): number {
  const px = (k / 3) | 0;
  return px * 4 + (k % 3);
}

self.onmessage = (ev: MessageEvent<InMsg>) => {
  const msg = ev.data;
  try {
    if (msg.type === "encode") {
      const src = new Uint8ClampedArray(msg.src);
      const payload = new Uint8Array(msg.payload);
      const header = new Uint8Array(msg.header);
      const out = new Uint8ClampedArray(src);
      const channels = msg.width * msg.height * 3;
      const { depth } = msg;

      // 1) header — always 1-bit LSB, channels 0..127
      for (let i = 0; i < 128; i++) {
        const byte = header[i >> 3];
        const bit = (byte >> (7 - (i % 8))) & 1;
        const idx = channelIndex(i);
        out[idx] = (out[idx] & 0xfe) | bit;
      }
      (self as unknown as { postMessage: (m: unknown) => void }).postMessage({ type: "progress", id: msg.id, value: 0.15 });

      // 2) payload @ depth bits/channel from channel 128
      const totalBits = payload.length * 8;
      const needed = Math.ceil(totalBits / depth);
      if (128 + needed > channels) throw new Error("Your payload is too large. Reduce the message size or increase bit depth.");
      const mask = depth === 1 ? 0xfe : 0xfc;
      let bitPos = 0;
      const reportEvery = Math.max(4000, Math.floor(needed / 25));
      for (let k = 0; k < needed; k++) {
        let chunk = 0;
        for (let b = 0; b < depth; b++) {
          const byteIdx = (bitPos / 8) | 0;
          const bitInByte = 7 - (bitPos % 8);
          const bit = byteIdx < payload.length ? (payload[byteIdx] >> bitInByte) & 1 : 0;
          chunk = (chunk << 1) | bit;
          bitPos++;
        }
        out[channelIndex(128 + k)] = (out[channelIndex(128 + k)] & mask) | chunk;
        if (k % reportEvery === 0) {
          (self as unknown as { postMessage: (m: unknown) => void }).postMessage({ type: "progress", id: msg.id, value: 0.15 + (k / needed) * 0.78 });
        }
      }

      // sampled modified-byte estimate (fast, no full scan)
      let modified = 0;
      const step = Math.max(1, Math.floor(out.length / 20000));
      let samples = 0;
      for (let i = 0; i < out.length; i += step) {
        samples++;
        if (out[i] !== src[i]) modified++;
      }
      const bytesModified = Math.round((modified / samples) * out.length);
      (self as unknown as { postMessage: (m: unknown, t?: Transferable[]) => void }).postMessage(
        { type: "encode-done", id: msg.id, rgba: out.buffer, bytesModified },
        [out.buffer]
      );
    } else if (msg.type === "decode") {
      const d = new Uint8ClampedArray(msg.rgba);
      const channels = msg.width * msg.height * 3;
      if (channels < 256) throw new Error("Image appears corrupted or not encoded with StegoVault.");
      const hb = new Uint8Array(16);
      for (let i = 0; i < 128; i++) {
        hb[i >> 3] = (hb[i >> 3] << 1) | (d[channelIndex(i)] & 1);
      }
      (self as unknown as { postMessage: (m: unknown) => void }).postMessage({ type: "progress", id: msg.id, value: 0.2 });

      const depth: 1 | 2 = hb[6] === 2 ? 2 : 1;
      const payloadLen = ((hb[8] << 24) >>> 0) + (hb[9] << 16) + (hb[10] << 8) + hb[11];
      if (payloadLen < 0 || payloadLen >= 60_000_000) throw new Error("Image appears corrupted or not encoded with StegoVault.");
      const needed = Math.ceil((payloadLen * 8) / depth);
      if (128 + needed > channels) throw new Error("Image appears corrupted or not encoded with StegoVault.");
      const payload = new Uint8Array(payloadLen);
      let bitPos = 0;
      const reportEvery = Math.max(4000, Math.floor(Math.max(1, needed) / 25));
      for (let k = 0; k < needed; k++) {
        const chunk = depth === 1 ? d[channelIndex(128 + k)] & 1 : d[channelIndex(128 + k)] & 3;
        for (let b = depth - 1; b >= 0; b--) {
          if (bitPos >= payloadLen * 8) break;
          payload[(bitPos / 8) | 0] = (payload[(bitPos / 8) | 0] << 1) | ((chunk >> b) & 1);
          bitPos++;
        }
        if (k % reportEvery === 0) {
          (self as unknown as { postMessage: (m: unknown) => void }).postMessage({ type: "progress", id: msg.id, value: 0.2 + (k / Math.max(1, needed)) * 0.7 });
        }
      }
      // transfer header + payload back
      const hbBuf = hb.buffer.slice(0) as ArrayBuffer;
      const plBuf = payload.buffer.slice(0) as ArrayBuffer;
      (self as unknown as { postMessage: (m: unknown, t?: Transferable[]) => void }).postMessage(
        { type: "decode-done", id: msg.id, header: hbBuf, payload: plBuf, channelsUsed: 128 + needed },
        [hbBuf, plBuf]
      );
    }
  } catch (err) {
    (self as unknown as { postMessage: (m: unknown) => void }).postMessage({
      type: "error",
      id: (msg as { id?: number }).id ?? 0,
      message: err instanceof Error ? err.message : "Worker processing failed.",
    });
  }
};

export {};
