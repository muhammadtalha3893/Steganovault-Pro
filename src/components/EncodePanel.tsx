import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lock, LockOpen, Cpu, ShieldCheck, Download, ClipboardCopy, FileUp,
  ChevronDown, Hash, Zap, Eye, EyeOff, Image as ImageIcon, AlertTriangle, CheckCircle2,
} from "lucide-react";
import Dropzone from "./Dropzone";
import { Tip, Toggle, SectionTitle, CompareSlider, ProgressBar, StrengthMeter } from "./bits";
import { makeToast, type ToastMsg } from "./Toasts";
import { getCapacity, estimatePayloadBytes, verdictSummary, getMagic } from "../lib/stego";
import { encryptPayload, sha256HexText } from "../lib/crypto";
import { encodeInWorker } from "../lib/stegoClient";
import { hexSlice, toStored, HEX_PAGE, loadImageFile, drawToCanvas, makeThumbnail, sanitizeText, sanitizeFilename } from "../lib/hex";
import { uid, type HistoryEntry } from "../lib/history";

interface Props {
  pushToast: (t: ToastMsg) => void;
  addEntry: (e: HistoryEntry) => void;
  goHistory: () => void;
}

const ACCEPT_EXT = ["png", "bmp", "webp", "jpg", "jpeg"];

export default function EncodePanel({ pushToast, addEntry, goHistory }: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string | null>(null);
  const [jpegWarn, setJpegWarn] = useState(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [origData, setOrigData] = useState<ImageData | null>(null);

  const [message, setMessage] = useState("");
  const [encrypt, setEncrypt] = useState(true);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [depth, setDepth] = useState<1 | 2>(1);

  const [encoding, setEncoding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [workerNote, setWorkerNote] = useState("");
  const [result, setResult] = useState<{
    stegoUrl: string; sha: string; bytesModified: number; payloadLen: number;
    hexVerdict: string; verdict: string;
    hexLines: HistoryEntry["hexLines"];
    hexTotal: number;
    origBytes: Uint8Array; stegoBytes: Uint8Array;
  } | null>(null);
  const [showHex, setShowHex] = useState(false);
  const [hexShown, setHexShown] = useState(HEX_PAGE);
  const txtRef = useRef<HTMLInputElement>(null);

  const capacity = useMemo(
    () => (dims ? getCapacity(dims.w, dims.h, depth) : null),
    [dims, depth]
  );
  const payloadBytes = useMemo(() => estimatePayloadBytes(message, encrypt), [message, encrypt]);
  const msgBytes = useMemo(() => new TextEncoder().encode(message).length, [message]);
  const overCapacity = capacity ? payloadBytes > capacity.usableBytes : false;
  const pwBad = encrypt && password.length < 8;
  const canEncode =
    !!origData && message.length > 0 && !overCapacity && !pwBad && !encoding;

  const handleFile = async (f: File) => {
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    const isImg = f.type.startsWith("image/");
    if (!isImg || !ACCEPT_EXT.includes(ext)) {
      pushToast(makeToast("error", "Unsupported format", `"${sanitizeFilename(f.name)}" is not a supported image. Use PNG, BMP or WebP. JPEG works with a warning.`));
      return;
    }
    try {
      const { img } = await loadImageFile(f);
      const canvas = drawToCanvas(img);
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setOrigData(id);
      setDims({ w: canvas.width, h: canvas.height });
      setPreview(canvas.toDataURL("image/png"));
      setFileName(sanitizeFilename(f.name));
      setFileType(`${f.type || "image/" + ext} · ${canvas.width}×${canvas.height}px`);
      setJpegWarn(ext === "jpg" || ext === "jpeg");
      setResult(null);
      pushToast(makeToast("success", "Cover image loaded", `${canvas.width}×${canvas.height}px · ${((canvas.width * canvas.height * 3 * depth) / 8 / 1024).toFixed(1)} KB raw channel space.`));
    } catch (err) {
      pushToast(makeToast("error", "Could not read image", err instanceof Error ? err.message : "Unknown error."));
    }
  };

  const importTxt = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 200_000) {
      pushToast(makeToast("warn", "Text file too large", "Keep pasted secrets under ~200 KB for reliable embedding."));
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      setMessage(sanitizeText(String(r.result || ""), 500000));
      pushToast(makeToast("success", "Secret loaded from file", sanitizeFilename(f.name)));
    };
    r.readAsText(f);
  };

  const doEncode = async () => {
    if (!origData || !dims || !preview) return;
    if (!message) { pushToast(makeToast("warn", "Nothing to hide", "Type a secret message first.")); return; }
    if (overCapacity) {
      pushToast(makeToast("error", "Payload too large", `Your payload is too large (${payloadBytes.toLocaleString()} B > ${capacity!.usableBytes.toLocaleString()} B capacity). Reduce the message size or increase bit depth.`));
      return;
    }
    if (pwBad) { pushToast(makeToast("error", "Password too short", "AES-256 password needs at least 8 characters — longer + symbols resist brute force.")); return; }
    setEncoding(true);
    setProgress(0.02);
    setWorkerNote(typeof Worker !== "undefined" ? "Worker thread: embedding bits off the main thread…" : "Worker unavailable — chunked main-thread fallback…");
    setResult(null);
    setHexShown(HEX_PAGE);
    try {
      const plain = new TextEncoder().encode(sanitizeText(message, 500000));
      setProgress(0.06);
      const payload = encrypt ? await encryptPayload(plain, password) : plain;
      // Header (v2 HMAC tag) is built inside encodeInWorker; pixel loops run in the Worker.
      const enc = await encodeInWorker(origData, payload, depth, encrypt, encrypt ? password : null, setProgress);
      const c = document.createElement("canvas");
      c.width = origData.width; c.height = origData.height;
      c.getContext("2d")!.putImageData(enc.imageData, 0, 0);
      const stegoUrl = c.toDataURL("image/png");
      const sha = await sha256HexText(stegoUrl + message);
      // Hex dump capped at first 1024 B with incremental "load more".
      const origBytes = new Uint8Array(origData.data.slice(0));
      const stegoBytes = new Uint8Array(enc.imageData.data.slice(0));
      const { lines, hotCount } = hexSlice(origBytes, stegoBytes, 0, HEX_PAGE);
      const integrity = "HMAC-SHA256 VERIFIED";
      const verdict = verdictSummary({ bytesModified: enc.bytesModified, integrity, encrypted: encrypt, depth, payloadLen: payload.length });
      const hexVerdict = `${hotCount} modified bytes in first ${HEX_PAGE.toLocaleString()} B · HMAC-SHA256 tag OK`;
      const hexLines = toStored(lines);
      const thumb = await makeThumbnail(stegoUrl);
      setResult({ stegoUrl, sha, bytesModified: enc.bytesModified, payloadLen: payload.length, hexVerdict, verdict, hexLines, hexTotal: Math.min(origBytes.length, stegoBytes.length), origBytes, stegoBytes });
      addEntry({
        id: uid(), action: "encode", timestamp: Date.now(),
        filename: fileName || "cover.png", status: "success",
        messagePreview: sanitizeText(message, 140), fullMessage: sanitizeText(message, 8000),
        bitDepth: depth, encrypted: encrypt, payloadBytes: payload.length,
        capacityBytes: capacity!.usableBytes, imageW: dims.w, imageH: dims.h,
        sha256: sha, hexVerdict, verdictSummary: verdict, thumbnail: thumb, hexLines,
        hexTotal: Math.min(origBytes.length, stegoBytes.length), authScheme: "HMAC-SHA256-32",
      });
      pushToast(makeToast("success", "Stego image forged", `${payload.length.toLocaleString()} B embedded · HMAC tag sealed · magic "${getMagic().map((b) => String.fromCharCode(b)).join("")}". Saved to History.`));
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Encoding failed.";
      const friendly = /too large|capacity/i.test(raw)
        ? `Your payload is too large. Reduce the message size or increase bit depth. (${raw})`
        : raw;
      pushToast(makeToast("error", "Encoding failed", friendly));
      addEntry({
        id: uid(), action: "encode", timestamp: Date.now(),
        filename: fileName || "cover.png", status: "failed",
        messagePreview: sanitizeText(message, 140), fullMessage: sanitizeText(message, 8000),
        bitDepth: depth, encrypted: encrypt, payloadBytes: payloadBytes,
        capacityBytes: capacity?.usableBytes || 0, imageW: dims?.w || 0, imageH: dims?.h || 0,
        sha256: "—", hexVerdict: "FAILED: " + friendly, verdictSummary: "VERDICT: FAILED | " + friendly,
        thumbnail: "", hexLines: [], authScheme: "HMAC-SHA256-32",
      });
    } finally {
      setEncoding(false);
      setWorkerNote("");
    }
  };

  const loadMoreHex = () => {
    if (!result) return;
    const next = Math.min(result.hexTotal, hexShown + HEX_PAGE);
    const { lines } = hexSlice(result.origBytes, result.stegoBytes, 0, next);
    setResult({ ...result, hexLines: toStored(lines) });
    setHexShown(next);
  };

  const downloadPNG = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result.stegoUrl;
    a.download = "steganovault-stego-" + Date.now().toString(36) + ".png";
    a.click();
    pushToast(makeToast("info", "Stego PNG downloading", "Share it as PNG — never JPEG — or the payload dies."));
  };

  const copyImage = async () => {
    if (!result) return;
    try {
      const res = await fetch(result.stegoUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      pushToast(makeToast("success", "Stego image copied", "Paste it anywhere — pixels carry the secret."));
    } catch {
      pushToast(makeToast("error", "Clipboard blocked", "Your browser refused image copy. Use Download PNG instead."));
    }
  };

  const capPct = capacity ? Math.min(100, (payloadBytes / Math.max(1, capacity.usableBytes)) * 100) : 0;

  return (
    <div className="fade-up">
      <SectionTitle
        kicker="// 01 · ENCRYPT & EMBED"
        title={<>Encode <span className="neon-text">Image</span></>}
        desc="Hide a secret message inside a cover image with LSB steganography. Optionally seal it with AES-256-GCM first. Everything runs locally — pixels never leave your browser."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <div className="glass rounded-2xl p-5">
            <h3 className="font-display font-semibold text-sm flex items-center gap-2 mb-3">
              <ImageIcon size={16} className="text-cyan-300" /> COVER IMAGE
            </h3>
            <Dropzone preview={preview} fileName={fileName} fileType={fileType} jpegWarn={jpegWarn} onFile={handleFile} label="Upload cover image" />
          </div>

          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-semibold text-sm flex items-center gap-2">
                <Zap size={16} className="text-violet-300" /> SECRET MESSAGE
              </h3>
              <button onClick={() => txtRef.current?.click()} aria-label="Import secret from text file" className="btn-ghost rounded-lg px-2.5 py-1.5 text-xs font-medium inline-flex items-center gap-1.5">
                <FileUp size={13} /> Import .txt
              </button>
              <input ref={txtRef} type="file" accept=".txt,text/plain" className="hidden" onChange={(e) => { importTxt(e.target.files?.[0]); e.target.value = ""; }} aria-label="Secret text file" />
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={500000}
              placeholder="Type the secret to hide… launch codes, love letters, seed phrases. It never leaves this tab."
              aria-label="Secret message"
              className="input-cyber w-full rounded-xl px-3.5 py-3 text-sm leading-relaxed resize-y min-h-[120px] font-mono2"
            />
            <div className="flex justify-between text-[11px] font-mono2 opacity-55 mt-1.5">
              <span>{msgBytes.toLocaleString()} B raw · {encrypt ? "+44 B envelope" : "no envelope"} = {payloadBytes.toLocaleString()} B payload</span>
              <span>{message.length.toLocaleString()} chars</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="glass rounded-2xl p-5">
            <h3 className="font-display font-semibold text-sm flex items-center gap-2 mb-4">
              <Lock size={16} className="text-cyan-300" /> ENCRYPTION · AES-256-GCM
              <Tip text="Your password is stretched with PBKDF2-HMAC-SHA256 (600,000 rounds per OWASP 2024 + random salt) into a 256-bit key. Wrong password = undecryptable noise. Keys are never stored." />
            </h3>
            <div className="flex items-center justify-between glass2 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2.5">
                {encrypt ? <Lock size={16} className="text-cyan-300" /> : <LockOpen size={16} className="opacity-50" />}
                <div>
                  <p className="text-sm font-semibold">{encrypt ? "Encryption ON" : "Encryption OFF"}</p>
                  <p className="text-xs opacity-55">{encrypt ? "Sealed with PBKDF2·600k + AES-GCM" : "Plaintext LSB — anyone can extract"}</p>
                </div>
              </div>
              <Toggle on={encrypt} onChange={setEncrypt} label="Toggle AES-256 encryption" />
            </div>
            <AnimatePresence>
              {encrypt && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="relative mt-3">
                    <input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Vault password (min 8 characters)…"
                      aria-label="Encryption password"
                      autoComplete="new-password"
                      className="input-cyber w-full rounded-xl px-3.5 py-2.5 text-sm pr-11"
                    />
                    <button onClick={() => setShowPw(!showPw)} aria-label={showPw ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100">
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <StrengthMeter password={password} />
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-4">
              <label className="text-sm font-semibold flex items-center gap-2 mb-2">
                <Cpu size={15} className="text-violet-300" /> BIT DEPTH
                <Tip text="1-bit LSB flips only the tiniest bit per channel: invisible, half the room. 2-bit LSB doubles capacity but can faintly band smooth gradients. Header always uses 1-bit so decoders auto-detect." />
              </label>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Bit depth">
                {([1, 2] as const).map((d) => (
                  <button
                    key={d}
                    role="radio"
                    aria-checked={depth === d}
                    onClick={() => setDepth(d)}
                    className={`rounded-xl px-3 py-2.5 text-left border transition-all ${depth === d ? "nav-active border" : "glass2 border border-transparent hover:border-cyan-400/40"}`}
                  >
                    <p className="font-mono2 text-sm font-bold">{d}-bit LSB</p>
                    <p className="text-[11px] opacity-60">{d === 1 ? "Stealth · max invisibility" : "Capacity ×2 · still subtle"}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="glass rounded-2xl p-5">
            <h3 className="font-display font-semibold text-sm flex items-center gap-2 mb-3">
              <ShieldCheck size={16} className="text-emerald-300" /> CAPACITY METER
              <Tip text="Each pixel gives 3 channels (R,G,B). Capacity = channels × bit-depth ÷ 8, minus a 16-byte vault header. The bar blocks encoding before overflow can corrupt pixels." />
            </h3>
            {capacity && dims ? (
              <>
                <div className="h-3 rounded-full overflow-hidden bg-[rgba(140,150,180,.18)]" role="progressbar" aria-valuenow={Math.round(capPct)} aria-valuemin={0} aria-valuemax={100} aria-label="Capacity usage">
                  <div className="h-full rounded-full transition-all duration-200" style={{ width: capPct + "%", background: overCapacity ? "linear-gradient(90deg,#ff5a78,#ffbe3c)" : "linear-gradient(90deg,#00f0ff,#a855f7)", boxShadow: "0 0 14px rgba(0,240,255,.5)" }} />
                </div>
                <div className="flex justify-between text-xs font-mono2 mt-2">
                  <span className={overCapacity ? "text-rose-300 font-bold" : "opacity-70"}>
                    {payloadBytes.toLocaleString()} / {capacity.usableBytes.toLocaleString()} B ({capPct.toFixed(1)}%)
                  </span>
                  <span className={overCapacity ? "text-rose-300" : "text-emerald-300"}>
                    {overCapacity ? "OVERFLOW" : `${(capacity.usableBytes - payloadBytes).toLocaleString()} B free`}
                  </span>
                </div>
                <p className="text-[11px] font-mono2 opacity-45 mt-1">{dims.w}×{dims.h}px · {capacity.channels.toLocaleString()} channels · LSB-{depth}bit</p>
              </>
            ) : (
              <div className="skeleton h-10 rounded-xl" aria-hidden />
            )}
            {overCapacity && (
              <p className="text-xs text-rose-300 mt-2 flex items-center gap-1.5" role="alert"><AlertTriangle size={13} /> Your payload is too large. Reduce the message size or increase bit depth.</p>
            )}

            <button
              onClick={doEncode}
              disabled={!canEncode}
              aria-label="Encode and seal image"
              className="btn-neon w-full rounded-xl mt-4 py-3.5 font-display font-bold tracking-wide text-[15px] disabled:opacity-40"
            >
              {encoding ? "FORGING PIXELS…" : "⚡ ENCODE & SEAL IMAGE"}
            </button>
            {encoding && <div className="mt-3"><ProgressBar value={progress} label={workerNote || "Embedding payload (Web Worker)"} /></div>}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {result && preview && (
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-5 mt-5 neon-border">
            <h3 className="font-display font-semibold flex items-center gap-2 mb-4">
              <CheckCircle2 size={17} className="text-emerald-300" /> STEGO FORGED — drag the divider to compare
            </h3>
            <div className="grid gap-5 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <CompareSlider before={preview} after={result.stegoUrl} />
              </div>
              <div className="lg:col-span-2 flex flex-col gap-3">
                <div className="glass2 rounded-xl p-3.5">
                  <p className="text-[11px] font-mono2 tracking-widest opacity-55 flex items-center gap-1.5"><Hash size={12} /> SHA-256 · STEGO FILE</p>
                  <p className="font-mono2 text-[11px] break-all mt-1.5 text-cyan-200 leading-relaxed">{result.sha}</p>
                </div>
                <div className="glass2 rounded-xl p-3.5 font-mono2 text-[11px] leading-relaxed">
                  <p className="text-emerald-300 font-bold">{result.verdict}</p>
                  <p className="opacity-60 mt-1">{result.hexVerdict}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={downloadPNG} aria-label="Download stego PNG" className="btn-neon rounded-xl px-4 py-2.5 text-sm inline-flex items-center gap-2"><Download size={15} /> Download PNG</button>
                  <button onClick={copyImage} aria-label="Copy stego image to clipboard" className="btn-ghost rounded-xl px-4 py-2.5 text-sm inline-flex items-center gap-2"><ClipboardCopy size={15} /> Copy image</button>
                  <button onClick={goHistory} aria-label="View entry in history" className="btn-ghost rounded-xl px-4 py-2.5 text-sm">View in History →</button>
                </div>
                <button onClick={() => setShowHex(!showHex)} aria-expanded={showHex} className="text-left text-xs font-mono2 opacity-70 hover:opacity-100 inline-flex items-center gap-1.5">
                  <ChevronDown size={14} className={`transition-transform ${showHex ? "rotate-180" : ""}`} /> {showHex ? "HIDE" : "SHOW"} HEX VERDICT · FIRST {HEX_PAGE.toLocaleString()} BYTES
                </button>
                {showHex && (
                  <div>
                    <div className="rounded-xl overflow-auto nice-scroll max-h-56 bg-[var(--code-bg)] border border-cyan-400/20 p-3 font-mono2 text-[10.5px] leading-[1.7]" role="log" aria-label="Hex dump">
                      {result.hexLines.map((l) => (
                        <div key={l.offset} className="flex gap-2 whitespace-nowrap">
                          <span className="opacity-40 w-10 shrink-0">{l.offset.toString(16).padStart(4, "0")}</span>
                          <span>
                            {l.hex.map((h, i) => (
                              <span key={i} className={l.hot[i] ? "hex-hot px-0.5" : "opacity-80"}>{h} </span>
                            ))}
                          </span>
                          <span className="opacity-35 hidden xl:inline">{l.ascii}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-[11px] font-mono2 opacity-55">{hexShown.toLocaleString()} / {result.hexTotal.toLocaleString()} B shown</p>
                      {hexShown < result.hexTotal && (
                        <button onClick={loadMoreHex} className="btn-ghost rounded-lg px-3 py-1.5 text-xs font-mono2">LOAD MORE +{HEX_PAGE.toLocaleString()} B</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
