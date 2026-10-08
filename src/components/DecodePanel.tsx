import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ScanSearch, Lock, ClipboardCopy, CheckCircle2, XCircle,
  FileWarning, Eye, EyeOff, AlertTriangle, Radar,
} from "lucide-react";
import Dropzone from "./Dropzone";
import { SectionTitle, ProgressBar, StrengthMeter } from "./bits";
import { makeToast, type ToastMsg } from "./Toasts";
import { decryptPayload, sha256HexText } from "../lib/crypto";
import { decodeInWorker } from "../lib/stegoClient";
import { parseHeader, getMagic, verifyHeaderAuth } from "../lib/stego";
import { loadImageFile, drawToCanvas, makeThumbnail, sanitizeText, sanitizeFilename, HEX_PAGE } from "../lib/hex";
import { uid, type HistoryEntry } from "../lib/history";

interface Props {
  pushToast: (t: ToastMsg) => void;
  addEntry: (e: HistoryEntry) => void;
}

export default function DecodePanel({ pushToast, addEntry }: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string | null>(null);
  const [jpegWarn, setJpegWarn] = useState(false);
  const [imgData, setImgData] = useState<ImageData | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [workerNote, setWorkerNote] = useState("");
  const [needsPw, setNeedsPw] = useState(false);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<Uint8Array | null>(null);
  const [pendingRawHeader, setPendingRawHeader] = useState<Uint8Array | null>(null);
  const [meta, setMeta] = useState<{ depth: 1 | 2; encrypted: boolean; payloadLen: number; version: number } | null>(null);

  const [decoded, setDecoded] = useState<{
    text: string; integrity: "PASSED" | "FAILED"; authOk: boolean;
    verdict: string; hexVerdict: string; sha: string;
    hexLines: HistoryEntry["hexLines"];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetForNewFile = () => {
    setDecoded(null); setError(null); setNeedsPw(false);
    setPendingPayload(null); setPendingRawHeader(null); setMeta(null); setPassword("");
  };

  const handleFile = async (f: File) => {
    resetForNewFile();
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    try {
      const { img } = await loadImageFile(f);
      const canvas = drawToCanvas(img);
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setImgData(id);
      setDims({ w: canvas.width, h: canvas.height });
      setPreview(canvas.toDataURL("image/png"));
      setFileName(sanitizeFilename(f.name));
      setFileType(`${f.type || "image/" + ext} · ${canvas.width}×${canvas.height}px`);
      setJpegWarn(ext === "jpg" || ext === "jpeg");
      pushToast(makeToast("info", "Suspect image staged", "Hit SCAN & EXTRACT — the header tells us if a password is needed."));
    } catch (err) {
      pushToast(makeToast("error", "Could not read image", err instanceof Error ? err.message : "Unknown error."));
    }
  };

  const buildStoredHex = (payloadLen: number, depth: 1 | 2): HistoryEntry["hexLines"] => {
    // Paginated, capped hex view: first HEX_PAGE bytes with embedded region hot.
    const bytes = imgData ? imgData.data.slice(0, HEX_PAGE) : new Uint8Array(HEX_PAGE);
    const hotUntil = Math.min(HEX_PAGE, 16 + Math.ceil((payloadLen * 8) / depth / 64));
    const lines: HistoryEntry["hexLines"] = [];
    for (let off = 0; off < bytes.length; off += 16) {
      const hex: string[] = [];
      const hot: boolean[] = [];
      for (let i = 0; i < 16 && off + i < bytes.length; i++) {
        hex.push(((bytes[off + i] as number) ?? 0).toString(16).padStart(2, "0"));
        hot.push(off + i < hotUntil);
      }
      lines.push({ offset: off, hex, hot, ascii: "" });
    }
    return lines;
  };

  const finalizeSuccess = async (
    text: string, authOk: boolean,
    m: { depth: 1 | 2; encrypted: boolean; payloadLen: number; version: number }
  ) => {
    const scheme = m.version === 2 ? (m.encrypted ? "HMAC-SHA256" : "SHA-256") : "CRC-16 (legacy)";
    const integrity = authOk ? "PASSED" : "FAILED";
    const verdict =
      "VERDICT: " + m.payloadLen.toLocaleString() + " bytes extracted | Integrity: " + integrity +
      " | Encoding: " + (m.encrypted ? "AES-256-GCM + " : "PLAINTEXT + ") + "LSB-" + m.depth + "bit";
    const hexVerdict = authOk ? `${scheme} tag match · payload intact` : `${scheme} MISMATCH · payload tampered`;
    const sha = preview ? await sha256HexText(preview + text) : "—";
    const hexLines = buildStoredHex(m.payloadLen, m.depth);
    const thumb = preview ? await makeThumbnail(preview) : "";
    const clean = sanitizeText(text, 8000);
    setDecoded({ text: clean, integrity: integrity as "PASSED" | "FAILED", authOk, verdict, hexVerdict, sha, hexLines });
    addEntry({
      id: uid(), action: "decode", timestamp: Date.now(),
      filename: fileName || "stego.png", status: authOk ? "success" : "corrupted",
      messagePreview: clean.slice(0, 140), fullMessage: clean,
      bitDepth: m.depth, encrypted: m.encrypted, payloadBytes: m.payloadLen,
      capacityBytes: Math.floor(((dims?.w || 0) * (dims?.h || 0) * 3 * m.depth) / 8),
      imageW: dims?.w || 0, imageH: dims?.h || 0,
      sha256: sha, hexVerdict, verdictSummary: verdict, thumbnail: thumb, hexLines,
      hexTotal: HEX_PAGE, authScheme: m.version === 2 ? "HMAC-SHA256-32" : "CRC-16-legacy",
    });
    if (authOk) pushToast(makeToast("success", "Secret extracted — integrity verified", `${m.payloadLen.toLocaleString()} B · ${m.encrypted ? "AES-256 decrypted" : "plaintext"} · saved to History.`));
    else {
      pushToast(makeToast("warn", "Image appears corrupted", "Header tag mismatch — pixels may have been recompressed or tampered."));
      addFailureEntry("Header tag mismatch — showing best-effort extract.");
    }
  };

  const addFailureEntry = (reason: string) => {
    addEntry({
      id: uid(), action: "decode", timestamp: Date.now(),
      filename: fileName || "stego.png", status: "failed",
      messagePreview: "(no data recovered)", fullMessage: sanitizeText(reason, 2000),
      bitDepth: meta?.depth || 1, encrypted: needsPw,
      payloadBytes: 0, capacityBytes: 0,
      imageW: dims?.w || 0, imageH: dims?.h || 0,
      sha256: "—", hexVerdict: "FAILED: " + reason,
      verdictSummary: "VERDICT: FAILED | " + reason,
      thumbnail: "", hexLines: [], authScheme: "HMAC-SHA256-32",
    });
  };

  const scan = async () => {
    if (!imgData) { pushToast(makeToast("warn", "No image staged", "Upload the suspected stego image first.")); return; }
    setScanning(true);
    setProgress(0.02);
    setWorkerNote(typeof Worker !== "undefined" ? "Worker thread: extracting bits off the main thread…" : "Worker unavailable — chunked fallback…");
    setError(null);
    setDecoded(null);
    try {
      // Probe pass with no password: worker extracts header+payload, main thread parses.
      const res = await decodeInWorker(imgData, { password: null, magic: getMagic() }, setProgress);
      const parsed = parseHeader(res.rawHeader, getMagic());
      const m = { depth: parsed.depth, encrypted: parsed.encrypted, payloadLen: parsed.payloadLen, version: parsed.version };
      setMeta(m);
      if (parsed.encrypted) {
        setNeedsPw(true);
        setPendingPayload(res.payload);
        setPendingRawHeader(res.rawHeader);
        setProgress(1);
        pushToast(makeToast("info", "Encrypted vault detected", `Header flags AES-256-GCM · LSB-${parsed.depth}bit · ${parsed.payloadLen.toLocaleString()} B · HMAC-SHA256 tag. Enter the password.`));
        setDecoded(null);
      } else {
        // Plaintext: verify tag now (SHA-256 fallback scheme).
        const authOk = await verifyHeaderAuth(res.rawHeader, parsed, res.payload, null);
        if (!authOk) {
          const msg = "Image appears corrupted or not encoded with StegoVault.";
          setError(msg);
          pushToast(makeToast("error", "Integrity check failed", msg));
          addFailureEntry(msg);
          return;
        }
        let text = "";
        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(res.payload);
        } catch {
          text = "[Binary payload — " + res.payload.length + " bytes, not valid UTF-8]\n" + Array.from(res.payload.slice(0, 200)).map((b) => b.toString(16).padStart(2, "0")).join(" ");
        }
        await finalizeSuccess(text, authOk, m);
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Decode failed.";
      const friendly = /corrupted|not encoded/i.test(raw)
        ? "Image appears corrupted or not encoded with StegoVault."
        : raw;
      setError(friendly);
      pushToast(makeToast("error", "Nothing to extract", friendly));
      addFailureEntry(friendly);
    } finally {
      setScanning(false);
      setWorkerNote("");
    }
  };

  const unlock = async () => {
    if (!pendingPayload || !meta || !pendingRawHeader) return;
    if (password.length < 8) { pushToast(makeToast("error", "Password too short", "Enter at least 8 characters.")); return; }
    setScanning(true);
    try {
      // Verify HMAC tag with the supplied password BEFORE decrypting.
      const tagOk = await verifyHeaderAuth(pendingRawHeader, parseHeader(pendingRawHeader, getMagic()), pendingPayload, password);
      if (!tagOk) {
        const msg = "Image appears corrupted or not encoded with StegoVault.";
        setError(msg);
        pushToast(makeToast("error", "Integrity check failed", msg));
        return;
      }
      const pt = await decryptPayload(pendingPayload, password);
      let text = "";
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(pt);
      } catch {
        text = "[Decrypted binary — " + pt.length + " bytes]\n" + Array.from(pt.slice(0, 200)).map((b) => b.toString(16).padStart(2, "0")).join(" ");
      }
      await finalizeSuccess(text, true, { ...meta, payloadLen: pendingPayload.length });
      setNeedsPw(false);
      setPendingPayload(null);
      setPendingRawHeader(null);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Decryption failed.";
      const friendly = /Incorrect password/i.test(raw) ? "Incorrect password or corrupted data." : raw;
      setError(friendly);
      pushToast(makeToast("error", "Unlock failed", friendly));
    } finally {
      setScanning(false);
    }
  };

  const copyText = async () => {
    if (!decoded) return;
    try {
      await navigator.clipboard.writeText(decoded.text);
      pushToast(makeToast("success", "Secret copied to clipboard", "Handle it carefully — clipboard is visible to other apps."));
    } catch {
      pushToast(makeToast("error", "Copy blocked", "Select the text manually with Ctrl/Cmd+C."));
    }
  };

  return (
    <div className="fade-up">
      <SectionTitle
        kicker="// 02 · SCAN & EXTRACT"
        title={<>Decode <span className="neon-text">Image</span></>}
        desc="Drop a suspected stego image. The scanner reads the 16-byte vault header first — if it flags AES-256, you'll be asked for the password. HMAC-SHA256 proves the payload survived intact."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="glass rounded-2xl p-5">
          <h3 className="font-display font-semibold text-sm flex items-center gap-2 mb-3">
            <Radar size={16} className="text-cyan-300" /> SUSPECT IMAGE
          </h3>
          <div className="relative">
            <Dropzone preview={preview} fileName={fileName} fileType={fileType} jpegWarn={jpegWarn} onFile={handleFile} label="Upload suspected stego image" />
            {scanning && (
              <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none" aria-hidden>
                <div className="absolute inset-0 bg-cyan-400/5 backdrop-blur-[1px]" />
                <div className="scanline" />
              </div>
            )}
          </div>
          <button
            onClick={scan}
            disabled={!imgData || scanning}
            aria-label="Scan and extract hidden data"
            className="btn-neon w-full rounded-xl mt-4 py-3.5 font-display font-bold tracking-wide text-[15px]"
          >
            {scanning ? "SCANNING PIXELS…" : "🔍 SCAN & EXTRACT"}
          </button>
          {scanning && <div className="mt-3"><ProgressBar value={progress} label={workerNote || "Reading LSB channels (Web Worker)"} /></div>}

          <AnimatePresence>
            {needsPw && !decoded && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 glass2 rounded-xl p-4 border !border-amber-400/40">
                <p className="text-sm font-semibold flex items-center gap-2 text-amber-200">
                  <Lock size={15} /> Encrypted vault detected
                </p>
                <p className="text-xs opacity-60 mt-1 font-mono2">
                  {meta ? `AES-256-GCM · LSB-${meta.depth}bit · ${meta.payloadLen.toLocaleString()} B sealed payload · HMAC-SHA256 tag` : ""}
                </p>
                <div className="relative mt-3">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") unlock(); }}
                    placeholder="Vault password…"
                    aria-label="Decryption password"
                    autoComplete="current-password"
                    className="input-cyber w-full rounded-xl px-3.5 py-2.5 text-sm pr-11"
                  />
                  <button onClick={() => setShowPw(!showPw)} aria-label="Toggle password visibility" className="absolute right-3 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <StrengthMeter password={password} />
                <button onClick={unlock} disabled={scanning} aria-label="Unlock and decrypt vault" className="btn-neon w-full rounded-xl mt-3 py-2.5 text-sm font-bold">
                  UNLOCK &amp; DECRYPT
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="glass rounded-2xl p-5 min-h-[320px]">
          <h3 className="font-display font-semibold text-sm flex items-center gap-2 mb-3">
            <ScanSearch size={16} className="text-violet-300" /> EXTRACTION RESULT
          </h3>
          {scanning ? (
            <div className="flex flex-col gap-3" aria-hidden>
              <div className="skeleton h-8 w-2/3 rounded-lg" />
              <div className="skeleton h-28 rounded-xl" />
              <div className="skeleton h-8 w-1/2 rounded-lg" />
            </div>
          ) : decoded ? (
            <div className="flex flex-col gap-3">
              <div role="status" className={`rounded-xl px-3.5 py-2.5 text-sm font-semibold flex items-center gap-2 border ${decoded.integrity === "PASSED" ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200" : "border-amber-400/40 bg-amber-400/10 text-amber-200"}`}>
                {decoded.integrity === "PASSED" ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
                {decoded.integrity === "PASSED" ? "✅ VERIFIED — HMAC-SHA256 tag match, payload intact" : "⚠️ CORRUPTED / TAMPERED — tag mismatch"}
              </div>
              <div className="rounded-xl bg-[var(--code-bg)] border border-cyan-400/20 p-3.5 font-mono2 text-[13px] leading-relaxed max-h-52 overflow-auto nice-scroll whitespace-pre-wrap break-words text-[var(--text)]" role="log" aria-label="Extracted secret">
                <span className="text-cyan-200">{decoded.text || "(empty payload)"}</span>
              </div>
              <p className="font-mono2 text-[11px] opacity-60 leading-relaxed">{decoded.verdict}<br />{decoded.hexVerdict}</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={copyText} aria-label="Copy extracted secret to clipboard" className="btn-neon rounded-xl px-4 py-2.5 text-sm inline-flex items-center gap-2"><ClipboardCopy size={15} /> Copy to clipboard</button>
              </div>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-400/40 bg-rose-400/10 p-4 flex items-start gap-3" role="alert">
              <XCircle size={20} className="text-rose-300 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-200 text-sm">Extraction failed</p>
                <p className="text-[13px] opacity-75 mt-1 leading-relaxed">{error}</p>
                <p className="text-xs opacity-55 mt-2 font-mono2">Common causes: plain image (no vault header) · JPEG recompression · wrong password · cropped/resized stego.</p>
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[240px] grid place-items-center text-center py-8">
              <div>
                <span className="mx-auto w-14 h-14 rounded-2xl grid place-items-center bg-gradient-to-br from-cyan-400/15 to-violet-500/15 border border-cyan-400/25 float-y">
                  <FileWarning size={24} className="text-cyan-200/70" />
                </span>
                <p className="mt-4 text-sm font-semibold opacity-80">No scan yet</p>
                <p className="text-xs opacity-50 mt-1 max-w-[240px]">Stage a stego image on the left, then run the scanner. Extracted secrets appear here.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
