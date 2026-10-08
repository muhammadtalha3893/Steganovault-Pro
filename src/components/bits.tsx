import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

/** Plain-language tooltip (hover + keyboard focus). */
export function Tip({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <span className="tooltip-wrap inline-flex items-center">
      {children ?? <Info size={13} className="text-cyan-300/80 cursor-help" />}
      <span className="tooltip-box" role="tooltip">{text}</span>
    </span>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(!on); } }}
      className="toggle-track"
      style={{ background: on ? "linear-gradient(92deg,#00e5ff,#8b5cf6)" : "rgba(140,150,180,.3)" }}
    >
      <span className="toggle-thumb" style={{ left: on ? "23px" : "3px" }} />
    </button>
  );
}

export function SectionTitle({ kicker, title, desc }: { kicker: string; title: React.ReactNode; desc: string }) {
  return (
    <div className="mb-5">
      <p className="font-mono2 text-[11px] tracking-[0.25em] text-cyan-300/80">{kicker}</p>
      <h2 className="font-display text-2xl md:text-3xl font-700 font-bold mt-1">{title}</h2>
      <p className="text-sm opacity-60 mt-1.5 max-w-2xl leading-relaxed">{desc}</p>
    </div>
  );
}

/**
 * Before/after comparison slider.
 * - Images are cached in memory (object URLs / data URLs passed in, never
 *   regenerated via toDataURL per frame) and rendered directly.
 * - Pointer Events cover mouse + touch; arrow keys move the handle (a11y).
 */
export function CompareSlider({ before, after }: { before: string; after: string }) {
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef(false);

  const move = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(Math.min(98, Math.max(2, ((clientX - r.left) / r.width) * 100)));
  };

  return (
    <div
      ref={ref}
      className="relative rounded-2xl overflow-hidden border border-cyan-400/25 select-none compare-handle neon-border"
      style={{ aspectRatio: "16/10", touchAction: "none" }}
      onPointerDown={(e) => { drag.current = true; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); move(e.clientX); }}
      onPointerMove={(e) => { if (drag.current) move(e.clientX); }}
      onPointerUp={() => (drag.current = false)}
      onPointerCancel={() => (drag.current = false)}
      onTouchStart={(e) => { const t = e.touches[0]; if (t) move(t.clientX); }}
      onTouchMove={(e) => { const t = e.touches[0]; if (t) move(t.clientX); }}
      role="slider"
      aria-label="Before and after comparison slider. Use left and right arrow keys to move the divider."
      aria-valuenow={Math.round(pos)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-orientation="horizontal"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); setPos((p) => Math.max(2, p - 4)); }
        if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); setPos((p) => Math.min(98, p + 4)); }
        if (e.key === "Home") { e.preventDefault(); setPos(2); }
        if (e.key === "End") { e.preventDefault(); setPos(98); }
      }}
    >
      <img src={after} alt="Encoded stego" className="absolute inset-0 w-full h-full object-contain bg-black/40" draggable={false} />
      <div className="absolute inset-0 overflow-hidden" style={{ width: pos + "%" }}>
        <img src={before} alt="Original cover" className="absolute inset-0 w-full h-full object-contain bg-black/40" style={{ width: ref.current?.getBoundingClientRect().width + "px", maxWidth: "none" }} draggable={false} />
      </div>
      <div className="absolute top-0 bottom-0" style={{ left: pos + "%" }}>
        <div className="absolute top-0 bottom-0 -left-px w-0.5 bg-gradient-to-b from-cyan-300 via-white to-violet-400 shadow-[0_0_16px_rgba(0,240,255,.8)]" />
        <div
          role="presentation"
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-[#0b0e17]/90 border border-cyan-300/70 grid place-items-center font-mono2 text-cyan-200 text-base shadow-[0_0_20px_rgba(0,240,255,.5)]"
          style={{ touchAction: "none" }}
        >
          ↔
        </div>
      </div>
      <span className="absolute top-3 left-3 font-mono2 text-[10px] px-2 py-1 rounded-md bg-black/60 border border-white/20 text-white/90">BEFORE</span>
      <span className="absolute top-3 right-3 font-mono2 text-[10px] px-2 py-1 rounded-md bg-cyan-400/90 text-[#06121a] font-bold">AFTER · STEGO</span>
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div>
      {label && <div className="flex justify-between text-xs font-mono2 mb-1.5 opacity-70"><span>{label}</span><span>{Math.round(value * 100)}%</span></div>}
      <div className="h-2.5 rounded-full overflow-hidden bg-[rgba(140,150,180,.18)]" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label || "Progress"}>
        <div
          className="h-full rounded-full transition-all duration-150"
          style={{ width: value * 100 + "%", background: "linear-gradient(90deg,#00f0ff,#a855f7)", boxShadow: "0 0 14px rgba(0,240,255,.6)" }}
        />
      </div>
    </div>
  );
}

/** Password strength meter: Weak / Medium / Strong / Elite. */
export function StrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  let s = 0;
  if (password.length >= 8) s++;
  if (password.length >= 12) s++;
  if (password.length >= 16) s++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) s++;
  if (/\d/.test(password)) s++;
  if (/[^A-Za-z0-9]/.test(password)) s++;
  const level = password.length < 8 ? 0 : s <= 2 ? 1 : s <= 3 ? 2 : s <= 4 ? 3 : 4;
  const meta = [
    { label: "Weak", color: "#ff5a78", hint: `${8 - Math.min(8, password.length)} more characters needed (min 8).` },
    { label: "Weak", color: "#ff5a78", hint: "Add length, mixed case, digits or symbols." },
    { label: "Medium", color: "#ffbe3c", hint: "Decent — longer + symbols would harden it." },
    { label: "Strong", color: "#00e6b8", hint: "Strong — PBKDF2·600k makes brute force costly." },
    { label: "Elite", color: "#00f0ff", hint: "Elite — long, complex, expensive to crack." },
  ][level];
  const filled = level === 0 ? 1 : level;
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1.5" role="img" aria-label={`Password strength: ${meta.label}`}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="h-1.5 flex-1 rounded-full transition-all"
            style={{ background: i < filled ? meta.color : "rgba(140,150,180,.25)", boxShadow: i < filled ? `0 0 8px ${meta.color}` : "none" }}
          />
        ))}
      </div>
      <p className="text-[11px] font-mono2 mt-1.5" style={{ color: meta.color }}>
        {meta.label.toUpperCase()} · {meta.hint}
      </p>
    </div>
  );
}

export function useNow() {
  const [, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);
}
