import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Vault, Lock, ScanSearch, History as HistoryIcon, GraduationCap,
  Sun, Moon, Menu, X, ShieldCheck, Github,
} from "lucide-react";
import Toasts, { makeToast, type ToastMsg } from "./components/Toasts";
import EncodePanel from "./components/EncodePanel";
import DecodePanel from "./components/DecodePanel";
import HistoryPanel from "./components/HistoryPanel";
import LearnPanel from "./components/LearnPanel";
import { loadHistory, saveHistory, type HistoryEntry } from "./lib/history";
import { getMagic, setMagicString, resetMagic, DEFAULT_MAGIC, magicToString } from "./lib/stego";

type Tab = "encode" | "decode" | "history" | "learn";

const NAV: { id: Tab; label: string; sub: string; icon: typeof Lock }[] = [
  { id: "encode", label: "Encode", sub: "Hide secrets", icon: Lock },
  { id: "decode", label: "Decode", sub: "Extract secrets", icon: ScanSearch },
  { id: "history", label: "History", sub: "Vault ledger", icon: HistoryIcon },
  { id: "learn", label: "How it Works", sub: "LSB manual", icon: GraduationCap },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("encode");
  const [toasts, setToasts] = useState<ToastMsg[]>([]);

  const pushToast = useCallback((t: ToastMsg) => {
    setToasts((prev) => [...prev.slice(-3), t]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  const [entries, setEntries] = useState<HistoryEntry[]>(() => loadHistory());
  const [theme, setTheme] = useState<"dark" | "light">(
    () => (localStorage.getItem("sv_theme") as "dark" | "light") || "dark"
  );
  const [mobileNav, setMobileNav] = useState(false);
  // Custom magic bytes (persisted to localStorage; obscures the header signature).
  const [magic, setMagicState] = useState<number[]>(() => getMagic());
  const [magicInput, setMagicInput] = useState(() => magicToString(getMagic()));
  const magicStr = magicToString(magic);
  const magicLabel = magic.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
  const isCustomMagic = magicStr !== magicToString(DEFAULT_MAGIC);

  const applyMagic = useCallback(() => {
    try {
      const arr = setMagicString(magicInput);
      setMagicState(arr);
      pushToast(makeToast("success", "Custom magic applied", `"${magicToString(arr)}" stored locally. Encoders + decoders must match.`));
    } catch (err) {
      pushToast(makeToast("error", "Invalid magic", err instanceof Error ? err.message : "Must be 4 printable ASCII characters."));
    }
  }, [magicInput, pushToast]);

  const resetMagicUi = useCallback(() => {
    const arr = resetMagic();
    setMagicState(arr);
    setMagicInput(magicToString(arr));
    pushToast(makeToast("info", "Magic reset", 'Back to default "SGV1".'));
  }, [pushToast]);

  useEffect(() => {
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(theme);
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("sv_theme", theme);
  }, [theme]);

  useEffect(() => {
    saveHistory(entries);
  }, [entries]);

  const addEntry = useCallback((e: HistoryEntry) => {
    setEntries((prev) => [e, ...prev].slice(0, 60));
  }, []);

  const removeOne = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const clearAll = useCallback(() => setEntries([]), []);

  useEffect(() => {
    // welcome toast once per session
    if (!sessionStorage.getItem("sv_welcomed")) {
      sessionStorage.setItem("sv_welcomed", "1");
      const t = setTimeout(
        () => pushToast(makeToast("info", "Welcome to SteganoVault Pro", "100% client-side — pixels never leave this tab. Start on Encode.")),
        600
      );
      return () => clearTimeout(t);
    }
  }, [pushToast]);

  const go = (t: Tab) => {
    setTab(t);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="relative min-h-screen">
      {/* ambient orbs */}
      <div className="orb w-[480px] h-[480px] -top-40 -left-40 bg-cyan-500/[0.13]" aria-hidden />
      <div className="orb w-[520px] h-[520px] top-[30%] -right-52 bg-violet-600/[0.14]" aria-hidden />
      <div className="orb w-[380px] h-[380px] bottom-0 left-[30%] bg-fuchsia-600/[0.07]" aria-hidden />

      <Toasts toasts={toasts} dismiss={dismiss} />

      {/* TOP BAR (mobile + theme) */}
      <header className="sticky top-0 z-40 border-b border-[var(--border)]" style={{ background: "color-mix(in srgb, var(--bg) 82%, transparent)", backdropFilter: "blur(16px)" }}>
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 h-16 flex items-center gap-3">
          <button className="lg:hidden p-2 -ml-2 opacity-80" onClick={() => setMobileNav(!mobileNav)} aria-label={mobileNav ? "Close navigation menu" : "Open navigation menu"} aria-expanded={mobileNav}>
            {mobileNav ? <X size={20} /> : <Menu size={20} />}
          </button>
          <button onClick={() => go("encode")} className="flex items-center gap-2.5 group" aria-label="SteganoVault Pro home">
            <span className="w-9 h-9 rounded-xl grid place-items-center bg-gradient-to-br from-cyan-400 to-violet-600 shadow-[0_0_22px_rgba(0,240,255,.45)] group-hover:scale-105 transition-transform">
              <Vault size={18} className="text-[#06121a]" strokeWidth={2.5} />
            </span>
            <span className="text-left leading-none">
              <span className="font-display font-bold text-[15px] tracking-tight block">STEGANO<span className="neon-text">VAULT</span> <span className="font-mono2 text-[10px] align-top opacity-70 border border-cyan-400/40 rounded px-1 py-0.5 ml-0.5">PRO</span></span>
              <span className="font-mono2 text-[10px] opacity-50 hidden sm:block">client-side LSB steganography suite</span>
            </span>
          </button>

          {/* desktop top nav (quick switch) */}
          <nav className="hidden lg:flex items-center gap-1.5 mx-auto" aria-label="Sections">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => go(n.id)}
                aria-current={tab === n.id ? "page" : undefined}
                className={`rounded-xl px-4 py-2 text-[13px] font-semibold font-display border border-transparent transition-all flex items-center gap-2 ${tab === n.id ? "nav-active" : "opacity-65 hover:opacity-100 hover:bg-white/[0.04]"}`}
              >
                <n.icon size={15} className={tab === n.id ? "text-cyan-300" : ""} />
                {n.label}
                {n.id === "history" && entries.length > 0 && (
                  <span className="font-mono2 text-[10px] bg-cyan-400/20 text-cyan-200 rounded-full px-1.5 py-0.5">{entries.length}</span>
                )}
              </button>
            ))}
          </nav>

          <div className="ml-auto lg:ml-0 flex items-center gap-2">
            <span className="hidden md:inline-flex items-center gap-1.5 font-mono2 text-[10px] text-emerald-300 border border-emerald-400/30 bg-emerald-400/10 rounded-full px-2.5 py-1">
              <ShieldCheck size={12} /> 100% LOCAL
            </span>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              aria-pressed={theme === "light"}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="btn-ghost rounded-xl p-2.5"
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </div>
        {/* mobile nav drawer */}
        <AnimatePresence>
          {mobileNav && (
            <motion.nav
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="lg:hidden overflow-hidden border-t border-[var(--border)]"
              aria-label="Sections mobile"
            >
              <div className="p-3 grid grid-cols-2 gap-2">
                {NAV.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => go(n.id)}
                    className={`rounded-xl px-3 py-3 text-left border flex items-center gap-2.5 ${tab === n.id ? "nav-active" : "glass2 border-transparent"}`}
                  >
                    <n.icon size={17} className={tab === n.id ? "text-cyan-300" : "opacity-60"} />
                    <span>
                      <span className="block text-sm font-bold font-display">{n.label}</span>
                      <span className="block text-[11px] opacity-55">{n.sub}</span>
                    </span>
                  </button>
                ))}
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>

      <div className="relative z-10 max-w-[1400px] mx-auto px-4 md:px-6 py-6 md:py-8 flex gap-6">
        {/* SIDEBAR (desktop persistent) */}
        <aside className="hidden lg:flex flex-col w-60 shrink-0 gap-2 sticky top-24 self-start" aria-label="Sidebar">
          <div className="glass rounded-2xl p-3 flex flex-col gap-1.5">
            <p className="font-mono2 text-[10px] tracking-[0.25em] opacity-50 px-2 pt-1 pb-2">WORKSPACE</p>
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => go(n.id)}
                aria-current={tab === n.id ? "page" : undefined}
                className={`rounded-xl px-3.5 py-3 text-left border transition-all flex items-center gap-3 ${tab === n.id ? "nav-active" : "border-transparent opacity-70 hover:opacity-100 hover:bg-white/[0.04]"}`}
              >
                <span className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${tab === n.id ? "bg-gradient-to-br from-cyan-400/30 to-violet-500/30 border border-cyan-400/40" : "bg-[rgba(140,150,180,.12)] border border-[var(--border)]"}`}>
                  <n.icon size={17} className={tab === n.id ? "text-cyan-300" : ""} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold font-display">{n.label}</span>
                  <span className="block text-[11px] opacity-55">{n.sub}</span>
                </span>
                {n.id === "history" && entries.length > 0 && (
                  <span className="ml-auto font-mono2 text-[10px] bg-cyan-400/20 text-cyan-200 rounded-full px-2 py-0.5">{entries.length}</span>
                )}
              </button>
            ))}
          </div>

          <div className="glass rounded-2xl p-4">
            <p className="font-mono2 text-[10px] tracking-[0.25em] opacity-50 mb-2">VAULT PROTOCOL</p>
            <div className="font-mono2 text-[11px] leading-[1.9] opacity-75">
              <p><span className="text-cyan-300">magic</span> {magicLabel} “{magicStr}”</p>
              <p><span className="text-cyan-300">crypto</span> PBKDF2·600k + AES-GCM</p>
              <p><span className="text-cyan-300">check</span> HMAC-SHA256 + SHA-256</p>
              <p><span className="text-cyan-300">depth</span> LSB-1 stealth / LSB-2 ×2</p>
            </div>
            <div className="mt-3 pt-3 border-t border-[var(--border)]">
              <label htmlFor="magic-input" className="font-mono2 text-[10px] tracking-[0.2em] opacity-50">CUSTOM MAGIC · 4 CHARS</label>
              <div className="flex gap-1.5 mt-1.5">
                <input
                  id="magic-input"
                  value={magicInput}
                  onChange={(e) => setMagicInput(e.target.value.slice(0, 4))}
                  onKeyDown={(e) => { if (e.key === "Enter") applyMagic(); }}
                  placeholder="SGV1"
                  maxLength={4}
                  aria-label="Custom 4-character magic bytes"
                  className="input-cyber flex-1 min-w-0 rounded-lg px-2 py-1.5 font-mono2 text-xs"
                />
                <button onClick={applyMagic} aria-label="Apply custom magic" title="Apply custom magic" className="btn-ghost rounded-lg px-2.5 py-1.5 text-xs font-bold">SET</button>
                {isCustomMagic && (
                  <button onClick={resetMagicUi} aria-label="Reset magic to default" title="Reset magic to SGV1" className="btn-ghost rounded-lg px-2.5 py-1.5 text-xs">↺</button>
                )}
              </div>
              <p className="text-[10.5px] font-mono2 opacity-45 mt-1.5 leading-relaxed">Obscures the signature. Decoders must use the same magic.</p>
            </div>
          </div>

          <div className="glass rounded-2xl p-4 text-[12px] leading-relaxed opacity-70">
            <p className="flex items-center gap-1.5 font-semibold opacity-100 mb-1"><ShieldCheck size={14} className="text-emerald-300" /> Privacy by architecture</p>
            All processing happens locally in your browser — nothing is uploaded.
          </div>
        </aside>

        {/* MAIN */}
        <main className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
            >
              {tab === "encode" && <EncodePanel pushToast={pushToast} addEntry={addEntry} goHistory={() => go("history")} />}
              {tab === "decode" && <DecodePanel pushToast={pushToast} addEntry={addEntry} />}
              {tab === "history" && <HistoryPanel entries={entries} pushToast={pushToast} clearAll={clearAll} removeOne={removeOne} />}
              {tab === "learn" && <LearnPanel />}
            </motion.div>
          </AnimatePresence>

          <footer className="mt-10 border-t border-[var(--border)] pt-5 pb-8 flex flex-col md:flex-row gap-3 md:items-center text-xs opacity-60">
            <p className="flex items-center gap-2">
              <Vault size={14} className="text-cyan-300" />
              <span><strong className="font-display">SteganoVault Pro</strong> — AES-256-GCM · LSB steganography · HMAC-SHA256 + SHA-256 verified.</span>
            </p>
            <p className="md:ml-auto font-mono2 flex items-center gap-2">
              <ShieldCheck size={13} className="text-emerald-300" />
              All processing happens locally in your browser — nothing is uploaded.
              <a href="https://github.com" target="_blank" rel="noreferrer" aria-label="GitHub" className="opacity-60 hover:opacity-100 ml-1"><Github size={14} /></a>
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
