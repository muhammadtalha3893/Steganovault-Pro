/**
 * crypto.ts — SteganoVault Pro cryptographic primitives (100% client-side, Web Crypto API).
 *
 * - AES-256-GCM payload sealing with PBKDF2-HMAC-SHA256 key derivation.
 * - PBKDF2 iteration count follows OWASP 2024 guidance: **600,000** rounds.
 * - Header authentication uses **HMAC-SHA256 truncated to 4 bytes** when a
 *   password is present, otherwise a plain **SHA-256 (first 4 bytes)** fallback
 *   so accidental corruption is still detected on plaintext embeds.
 * - Keys are never stored; salts/IVs are random per encryption (16 B salt + 12 B IV).
 */

const enc = new TextEncoder();

/** OWASP-2024 recommended PBKDF2-HMAC-SHA256 iteration count. */
export const PBKDF2_ITERATIONS = 600_000;

/** Domain separator so the header-auth key differs from the AES data key. */
const HMAC_DOMAIN = "::stegovault-hmac-v2";

/**
 * Derive an AES-256-GCM CryptoKey from a password + salt.
 * @param password User-supplied vault password (min 8 chars, enforced by UI).
 * @param salt 16-byte random salt stored in the payload envelope.
 */
export async function deriveAesKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt.slice().buffer as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Derive an HMAC-SHA256 CryptoKey bound to the vault password.
 * The password is first hashed with a domain separator so the auth key
 * is cryptographically isolated from the AES data key.
 */
export async function deriveHmacKey(password: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(password + HMAC_DOMAIN));
  return crypto.subtle.importKey("raw", digest, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

/**
 * Encrypt a plaintext payload → [salt16 | iv12 | ciphertext+tag16].
 * Envelope overhead is therefore always 44 bytes.
 */
export async function encryptPayload(plain: Uint8Array, password: string): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(password, salt);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv.slice().buffer as ArrayBuffer }, key, plain.slice().buffer as ArrayBuffer)
  );
  const out = new Uint8Array(16 + 12 + ct.length);
  out.set(salt, 0);
  out.set(iv, 16);
  out.set(ct, 28);
  return out;
}

/**
 * Decrypt a payload envelope produced by {@link encryptPayload}.
 * @throws Error with user-friendly message "Incorrect password or corrupted data."
 *   when authentication fails (wrong password) or the envelope is malformed.
 */
export async function decryptPayload(payload: Uint8Array, password: string): Promise<Uint8Array> {
  if (payload.length < 29) throw new Error("Incorrect password or corrupted data.");
  const salt = payload.slice(0, 16);
  const iv = payload.slice(16, 28);
  const ct = payload.slice(28);
  const key = await deriveAesKey(password, salt);
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv.slice().buffer as ArrayBuffer }, key, ct.slice().buffer as ArrayBuffer);
    return new Uint8Array(pt);
  } catch {
    throw new Error("Incorrect password or corrupted data.");
  }
}

/**
 * Compute the 4-byte header authentication tag.
 * Covers the 12-byte header prefix (magic · version · flags · depth · length)
 * concatenated with the full payload, so both header tampering and payload
 * corruption are detected.
 * @param header12 First 12 bytes of the header (tag bytes excluded).
 * @param payload Full (possibly encrypted) payload bytes.
 * @param password Vault password when `encrypted` is true; otherwise null.
 * @param encrypted Whether AES-256-GCM sealing was applied.
 * @returns 4-byte tag to store at header offsets 12..15.
 */
export async function computeHeaderTag(
  header12: Uint8Array,
  payload: Uint8Array,
  password: string | null,
  encrypted: boolean
): Promise<Uint8Array> {
  const data = new Uint8Array(header12.length + payload.length);
  data.set(header12, 0);
  data.set(payload, header12.length);
  let digest: ArrayBuffer;
  if (encrypted && password) {
    const hkey = await deriveHmacKey(password);
    digest = await crypto.subtle.sign("HMAC", hkey, data.slice().buffer as ArrayBuffer);
  } else {
    digest = await crypto.subtle.digest("SHA-256", data.slice().buffer as ArrayBuffer);
  }
  return new Uint8Array(digest).slice(0, 4);
}

/**
 * Recompute and constant-time-compare a stored 4-byte header tag.
 */
export async function verifyHeaderTag(
  header12: Uint8Array,
  payload: Uint8Array,
  expected4: Uint8Array,
  password: string | null,
  encrypted: boolean
): Promise<boolean> {
  const actual = await computeHeaderTag(header12, payload, password, encrypted);
  if (actual.length !== 4 || expected4.length < 4) return false;
  let diff = 0;
  for (let i = 0; i < 4; i++) diff |= actual[i] ^ expected4[i];
  return diff === 0;
}

/** SHA-256 of raw bytes → lowercase hex string. */
export async function sha256HexBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 of a UTF-8 string → lowercase hex string. */
export async function sha256HexText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface StrengthScore {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Weak" | "Medium" | "Strong" | "Elite";
  hint: string;
}

/**
 * Score a vault password 0–4 for the strength meter.
 * Rewards length (8/12/16+) plus character-class diversity.
 */
export function scorePassword(pw: string): StrengthScore {
  if (!pw) return { score: 0, label: "Weak", hint: "Enter at least 8 characters." };
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (pw.length >= 16) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const clamped = Math.min(4, Math.floor(s / 1.5)) as 0 | 1 | 2 | 3 | 4;
  if (pw.length < 8) return { score: 0, label: "Weak", hint: `${8 - pw.length} more characters needed (min 8).` };
  if (clamped <= 1) return { score: 1, label: "Weak", hint: "Add length, mixed case, digits or symbols." };
  if (clamped === 2) return { score: 2, label: "Medium", hint: "Decent — longer + symbols would harden it." };
  if (clamped === 3) return { score: 3, label: "Strong", hint: "Strong — PBKDF2·600k makes brute force costly." };
  return { score: 4, label: "Elite", hint: "Elite — long, complex, expensive to crack." };
}
