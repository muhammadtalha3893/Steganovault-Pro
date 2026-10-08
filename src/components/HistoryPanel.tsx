import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Download, FileText, Trash2, ChevronDown, Vault,
  Image as ImageIcon, Lock, LockOpen, X, FileJson, CalendarDays,
} from "lucide-react";
import { SectionTitle } from "./bits";
import { makeToast, type ToastMsg } from "./Toasts";
import type { HistoryEntry } from "../lib/history";
import { timeAgo, downloadEntryJSON } from "../lib/history";
import { downloadEntryPDF, downloadAllPDF, downloadReportCard } from "../lib/report";

interface Props {
  entries: HistoryEntry[];
  pushToast: (t: ToastMsg) => void;
  clearAll: () => void;
  removeOne: (id: string) => void;
}

const PAGE_SIZE = 12;

function StatusBadge({ s }: { s: string }) {
  const cls = s === "success" ? "status-success" : s === "corrupted" ? "status-corrupted" : "status-failed";
  return <span className={`font-mono2 text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider ${cls}`}>{s}</span>;
}

function toDay(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function HistoryPanel({ entries, pushToast, clearAll, removeOne }: Props) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "encode" | "decode">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [openHex, setOpenHex] = useState<string | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [confirmClear, setConfirmClear] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter !== "all" && e.action !== filter) return false;
      if (from && toDay(e.timestamp) < from) return false;
      if (to && toDay(e.timestamp) > to) return false;
      if (!needle) return true;
      return (
        e.filename.toLowerCase().includes(needle) ||
        e.fullMessage.toLowerCase().includes(needle) ||
        e.messagePreview.toLowerCase().includes(needle) ||
        e.verdictSummary.toLowerCase().includes(needle)
      );
    });
  }, [entries, q, filter, from, to]);

  const shown = filtered.slice(0, visible);

  const stats = useMemo(() => ({
    total: entries.length,
    enc: entries.filter((e) => e.action === "encode").length,
    dec: entries.filter((e) => e.action === "decode").length,
    ok: entries.filter((e) => e.status === "success").length,
  }), [entries]);

  const exportJSON = (e: HistoryEntry) => {
    downloadEntryJSON(e);
    pushToast(makeToast("success", "Entry JSON exported", "Metadata + message saved as structured JSON."));
  };

  return (
    <div className="fade-up">
      <SectionTitle
        kicker="// 03 · VAULT LEDGER"
        title={<>Mission <span className="neon-text">History</span></>}
        desc="Every encode & decode is logged to localStorage — thumbnails, verdicts, hex dumps. Export audit-grade PDF reports or wipe the ledger. Nothing ever leaves this device."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          ["TOTAL OPS", String(stats.total)],
          ["ENCODED", String(stats.enc)],
          ["DECODED", String(stats.dec)],
          ["VERIFIED", String(stats.ok)],
        ].map(([k, v]) => (
          <div key={k} className="glass rounded-xl px-4 py-3">
            <p className="font-mono2 text-[10px] tracking-[0.2em] opacity-55">{k}</p>
            <p className="font-display text-2xl font-bold neon-text">{v}</p>
          </div>
        ))}
      </div>

      <div className="glass rounded-2xl p-4 mb-5 flex flex-col gap-3">
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setVisible(PAGE_SIZE); }}
              placeholder="Search filename, message, verdict…"
              aria-label="Search history"
              className="input-cyber w-full rounded-xl pl-9 pr-3 py-2.5 text-sm"
            />
          </div>
          <div className="flex gap-2" role="tablist" aria-label="Filter by action">
            {(["all", "encode", "decode"] as const).map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                aria-label={`Show ${f} entries`}
                onClick={() => { setFilter(f); setVisible(PAGE_SIZE); }}
                className={`rounded-lg px-3.5 py-2 text-xs font-bold font-mono2 uppercase tracking-wider border transition-all ${filter === f ? "nav-active border" : "glass2 border-transparent opacity-70 hover:opacity-100"}`}
              >
                {f === "all" ? "All" : f === "encode" ? "Encoded" : "Decoded"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="flex items-center gap-2 text-xs font-mono2 opacity-80">
            <CalendarDays size={14} className="text-cyan-300" />
            <span>DATE RANGE</span>
            <input type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setVisible(PAGE_SIZE); }} aria-label="Filter from date" className="input-cyber rounded-lg px-2 py-1.5 text-xs" />
            <span className="opacity-50">→</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setVisible(PAGE_SIZE); }} aria-label="Filter to date" className="input-cyber rounded-lg px-2 py-1.5 text-xs" />
            {(from || to) && (
              <button onClick={() => { setFrom(""); setTo(""); }} aria-label="Clear date filter" className="btn-ghost rounded-lg px-2 py-1 text-[11px]">Clear</button>
            )}
          </div>
          <div className="flex gap-2 md:ml-auto">
            <button
              onClick={() => { if (entries.length === 0) { pushToast(makeToast("warn", "Ledger is empty", "Nothing to export yet.")); return; } downloadAllPDF(entries); pushToast(makeToast("success", "Audit PDF exported", entries.length + " entries compiled into one report.")); }}
              aria-label="Export all history as PDF"
              className="btn-ghost rounded-xl px-3.5 py-2.5 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <FileText size={14} /> Export all PDF
            </button>
            <button
              onClick={() => setConfirmClear(true)}
              aria-label="Clear all history"
              className="rounded-xl px-3.5 py-2.5 text-xs font-semibold inline-flex items-center gap-1.5 border border-rose-400/40 text-rose-300 hover:bg-rose-400/10 transition-all whitespace-nowrap"
            >
              <Trash2 size={14} /> Clear
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="glass rounded-2xl py-16 px-6 text-center">
          <span className="mx-auto w-16 h-16 rounded-2xl grid place-items-center bg-gradient-to-br from-cyan-400/15 to-violet-500/15 border border-cyan-400/25 float-y">
            <Vault size={28} className="text-cyan-200/80" />
          </span>
          <p className="font-display font-bold text-lg mt-5">{entries.length === 0 ? "The vault ledger is empty" : "No entries match"}</p>
          <p className="text-sm opacity-55 mt-1.5 max-w-sm mx-auto leading-relaxed">
            {entries.length === 0
              ? "Encode your first secret or decode a stego image — every operation is recorded here with its hex verdict."
              : "Try a different search term, date range, or filter."}
          </p>
        </div>
      ) : (
        <div>
          <p className="text-[11px] font-mono2 opacity-50 mb-3" role="status">SHOWING {shown.length} OF {filtered.length} MATCHING · {entries.length} TOTAL</p>
          <div className="flex flex-col gap-4">
            <AnimatePresence initial={false}>
              {shown.map((e) => (
                <motion.article
                  key={e.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="glass rounded-2xl p-4 md:p-5"
                >
                  <div className="flex gap-4">
                    {e.thumbnail ? (
                      <img src={e.thumbnail} alt="" className="w-16 h-16 md:w-20 md:h-20 rounded-xl object-cover border border-cyan-400/25 shrink-0" />
                    ) : (
                      <span className="w-16 h-16 md:w-20 md:h-20 rounded-xl grid place-items-center bg-[rgba(140,150,180,.12)] border border-[var(--border)] shrink-0">
                        <ImageIcon size={22} className="opacity-40" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`font-mono2 text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider border ${e.action === "encode" ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200" : "border-violet-400/40 bg-violet-400/10 text-violet-200"}`}>
                          {e.action === "encode" ? "⬢ ENCODE" : "⬣ DECODE"}
                        </span>
                        <StatusBadge s={e.status} />
                        <span className="text-[11px] font-mono2 opacity-50">{new Date(e.timestamp).toLocaleString()} · {timeAgo(e.timestamp)}</span>
                        <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-mono2 opacity-60">
                          {e.encrypted ? <Lock size={11} className="text-amber-300" /> : <LockOpen size={11} />}
                          {e.encrypted ? "AES-256" : "plain"} · LSB-{e.bitDepth}
                        </span>
                      </div>
                      {/* React text nodes auto-escape — filenames/messages can never inject markup. */}
                      <p className="text-sm font-semibold truncate mt-1.5 font-display">{e.filename}</p>
                      <p className="text-[13px] opacity-65 mt-0.5 truncate font-mono2">
                        “{e.messagePreview || "(no preview)"}”
                      </p>
                      <p className="font-mono2 text-[10.5px] text-cyan-200/80 mt-1.5 leading-relaxed break-words">{e.verdictSummary}</p>
                    </div>
                    <button onClick={() => removeOne(e.id)} aria-label={`Delete entry ${e.filename}`} className="self-start opacity-40 hover:opacity-100 hover:text-rose-300 transition-all p-1">
                      <X size={16} />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3.5">
                    <button
                      onClick={() => setOpenHex(openHex === e.id ? null : e.id)}
                      className="btn-ghost rounded-lg px-3 py-1.5 text-xs font-mono2 inline-flex items-center gap-1.5"
                      aria-expanded={openHex === e.id}
                      aria-label={`Toggle hex verdict for ${e.filename}`}
                    >
                      <ChevronDown size={13} className={`transition-transform ${openHex === e.id ? "rotate-180" : ""}`} />
                      HEX VERDICT VIEWER
                    </button>
                    <button onClick={() => { downloadReportCard(e); pushToast(makeToast("success", "Report card PNG exporting", "Styled forensic card with thumbnail + verdict.")); }} aria-label={`Download report card PNG for ${e.filename}`} className="btn-ghost rounded-lg px-3 py-1.5 text-xs inline-flex items-center gap-1.5">
                      <Download size={13} /> Card PNG
                    </button>
                    <button onClick={() => { downloadEntryPDF(e); pushToast(makeToast("success", "Entry PDF exported", "A4 audit report downloaded.")); }} aria-label={`Download entry PDF for ${e.filename}`} className="btn-ghost rounded-lg px-3 py-1.5 text-xs inline-flex items-center gap-1.5">
                      <FileText size={13} /> Entry PDF
                    </button>
                    <button onClick={() => exportJSON(e)} aria-label={`Export entry JSON for ${e.filename}`} className="btn-ghost rounded-lg px-3 py-1.5 text-xs inline-flex items-center gap-1.5">
                      <FileJson size={13} /> JSON
                    </button>
                  </div>

                  <AnimatePresence>
                    {openHex === e.id && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                        <div className="mt-3 rounded-xl border border-cyan-400/20 overflow-hidden">
                          <div className="px-3.5 py-2.5 bg-[rgba(0,240,255,.06)] border-b border-cyan-400/15 font-mono2 text-[11px] text-emerald-300 font-bold">
                            {e.verdictSummary}
                          </div>
                          {e.hexLines.length > 0 ? (
                            <div className="bg-[var(--code-bg)] p-3 font-mono2 text-[10.5px] leading-[1.75] max-h-64 overflow-auto nice-scroll" role="log" aria-label={`Hex dump for ${e.filename}`}>
                              {e.hexLines.map((l) => (
                                <div key={l.offset} className="flex gap-2 whitespace-nowrap">
                                  <span className="opacity-40 w-10 shrink-0">{l.offset.toString(16).padStart(4, "0")}</span>
                                  <span>
                                    {l.hex.map((h, i) => (
                                      <span key={i} className={l.hot[i] ? "hex-hot px-0.5" : "opacity-80 text-slate-300"}>{h} </span>
                                    ))}
                                  </span>
                                </div>
                              ))}
                              <p className="opacity-40 mt-2">— first 1,024 bytes shown · <span className="hex-hot px-1">highlighted</span> = embedded region —</p>
                            </div>
                          ) : (
                            <p className="bg-[var(--code-bg)] p-4 text-xs font-mono2 opacity-50">No hex dump stored for this entry (failed op or legacy record).</p>
                          )}
                          {e.fullMessage && (
                            <div className="px-3.5 py-2.5 border-t border-cyan-400/15 font-mono2 text-[11px] opacity-70 max-h-28 overflow-auto nice-scroll whitespace-pre-wrap break-words">
                              FULL MESSAGE: {e.fullMessage.slice(0, 2000)}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.article>
              ))}
            </AnimatePresence>
          </div>
          {visible < filtered.length && (
            <button
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
              aria-label={`Show more history entries, ${filtered.length - visible} remaining`}
              className="btn-ghost w-full rounded-xl mt-4 py-3 text-sm font-semibold"
            >
              SHOW MORE · {filtered.length - visible} REMAINING
            </button>
          )}
        </div>
      )}

      <AnimatePresence>
        {confirmClear && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] grid place-items-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setConfirmClear(false)}>
            <motion.div initial={{ scale: 0.94, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96 }} onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-label="Confirm wipe history" className="glass rounded-2xl p-6 max-w-sm w-full neon-border">
              <h3 className="font-display font-bold text-lg">Wipe the entire ledger?</h3>
              <p className="text-sm opacity-60 mt-1.5 leading-relaxed">All {entries.length} entr{entries.length === 1 ? "y" : "ies"}, thumbnails and hex verdicts will be erased from localStorage. This cannot be undone.</p>
              <div className="flex gap-2 mt-5">
                <button onClick={() => setConfirmClear(false)} className="btn-ghost flex-1 rounded-xl py-2.5 text-sm font-semibold">Keep history</button>
                <button onClick={() => { clearAll(); setConfirmClear(false); pushToast(makeToast("info", "Ledger wiped", "All history entries erased from this browser.")); }} className="flex-1 rounded-xl py-2.5 text-sm font-bold bg-rose-500/90 hover:bg-rose-500 text-white transition-colors">Wipe all</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
