import { useState } from "react";
import { motion } from "framer-motion";
import { Binary, ArrowRightLeft, Eye, MousePointerClick } from "lucide-react";
import { SectionTitle, Tip } from "./bits";

function PixelDemo() {
  const [bit, setBit] = useState(0);
  // demo: pixel byte 1011010X, secret bit flips LSB
  const base = [1, 0, 1, 1, 0, 1, 0];
  return (
    <div className="glass2 rounded-2xl p-5">
      <p className="font-mono2 text-[11px] tracking-[0.2em] opacity-60 mb-3">INTERACTIVE · FLIP THE SECRET BIT</p>
      <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Bit swap demo">
        {base.map((b, i) => (
          <span key={i} className="w-9 h-11 rounded-lg grid place-items-center font-mono2 font-bold text-lg bg-[rgba(140,150,180,.14)] border border-[var(--border)]">{b}</span>
        ))}
        <button
          onClick={() => setBit(bit ^ 1)}
          aria-label="Toggle secret bit"
          className="bit-flip w-9 h-11 rounded-lg grid place-items-center font-mono2 font-bold text-lg border border-fuchsia-400/50 cursor-pointer hover:scale-105 transition-transform"
        >
          {bit}
        </button>
      </div>
      <p className="text-xs font-mono2 opacity-65 mt-3 leading-relaxed">
        Pixel channel <span className="text-cyan-300">1011010_</span> + secret bit <span className="text-fuchsia-300">{bit}</span> →{" "}
        <span className="text-emerald-300">1011010{bit}</span> · brightness shifts by 1/255 — invisible to the eye.
      </p>
      <button onClick={() => setBit(bit ^ 1)} className="btn-ghost rounded-lg px-3 py-1.5 text-xs mt-3 inline-flex items-center gap-1.5">
        <MousePointerClick size={13} /> Flip secret bit
      </button>
    </div>
  );
}

const steps = [
  {
    icon: Binary,
    title: "1 · Pixels → binary",
    body: "Every image is a grid of pixels. Each pixel has Red, Green, Blue channels (0–255), each one byte — eight binary digits. An 800×600 photo holds 1.44M channels to whisper into.",
  },
  {
    icon: ArrowRightLeft,
    title: "2 · Swap the last bit",
    body: "LSB steganography replaces the least-significant bit of each channel with one bit of your secret. 254 vs 255 red is a 0.4% shift — cameras, eyes and JPEG previews can't see it, but the decoder reads it back exactly.",
  },
  {
    icon: Eye,
    title: "3 · Header + payload",
    body: "SteganoVault writes a 16-byte header first (magic · version 2 · AES flag · bit-depth · length · 4-byte HMAC-SHA256 tag, or SHA-256 tag for plaintext), always at 1-bit depth so any decoder finds it. Then the payload streams in at 1 or 2 bits per channel, sealed with AES-256-GCM (PBKDF2·600k) when you set a password.",
  },
];

export default function LearnPanel() {
  const [open, setOpen] = useState(true);
  return (
    <div className="fade-up">
      <SectionTitle
        kicker="// 00 · FIELD MANUAL"
        title={<>How LSB <span className="neon-text">Steganography</span> Works</>}
        desc="The 60-second mental model behind the vault. No math degree required — just bits, pixels, and one invisible swap."
      />
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="glass rounded-xl px-4 py-2.5 text-sm font-semibold mb-4 inline-flex items-center gap-2"
      >
        {open ? "Collapse manual" : "Expand manual"} <span className={`transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid gap-4 lg:grid-cols-3">
          {steps.map((s) => (
            <div key={s.title} className="glass rounded-2xl p-5">
              <span className="w-10 h-10 rounded-xl grid place-items-center bg-gradient-to-br from-cyan-400/20 to-violet-500/20 border border-cyan-400/30">
                <s.icon size={19} className="text-cyan-300" />
              </span>
              <h3 className="font-display font-bold mt-3">{s.title}</h3>
              <p className="text-[13px] opacity-65 mt-1.5 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </motion.div>
      )}
      <div className="grid gap-4 lg:grid-cols-2 mt-4">
        <PixelDemo />
        <div className="glass rounded-2xl p-5">
          <p className="font-mono2 text-[11px] tracking-[0.2em] opacity-60 mb-3">WHY JPEG KILLS SECRETS · WHY PNG SAVES THEM</p>
          <ul className="text-[13px] leading-relaxed flex flex-col gap-2.5 opacity-80">
            <li><strong className="text-cyan-200">PNG / BMP / WebP-lossless</strong> store exact channel values — every swapped bit survives the save. <Tip text="Lossless = what you write is what you read. Required for any LSB scheme." /></li>
            <li><strong className="text-amber-200">JPEG</strong> re-quantizes 8×8 blocks to shrink files — your LSBs are the first casualties. <Tip text="JPEG optimizes for human eyes, not hidden bits. Never share stego as JPEG." /></li>
            <li><strong className="text-emerald-200">Rule:</strong> encode from anything, but always download &amp; share the result as <span className="font-mono2">PNG</span>.</li>
            <li><strong className="text-violet-200">Tamper evidence:</strong> any recompress, crop or filter breaks the HMAC-SHA256 tag → decode reports CORRUPTED instead of silently lying.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
