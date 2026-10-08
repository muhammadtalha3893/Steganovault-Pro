import { useRef, useState } from "react";
import { ImagePlus, FileWarning, CheckCircle2, RefreshCw } from "lucide-react";

interface Props {
  preview: string | null;
  fileName: string | null;
  fileType: string | null;
  jpegWarn: boolean;
  compact?: boolean;
  label?: string;
  onFile: (f: File) => void;
}

export default function Dropzone({ preview, fileName, fileType, jpegWarn, compact, label, onFile }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const counter = useRef(0);
  const open = () => inputRef.current?.click();

  return (
    <div>
      <div
        onDragEnter={(e) => { e.preventDefault(); counter.current++; setDragging(true); }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => { e.preventDefault(); counter.current--; if (counter.current <= 0) { counter.current = 0; setDragging(false); } }}
        onDrop={(e) => { e.preventDefault(); counter.current = 0; setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
        onClick={open}
        role="button"
        tabIndex={0}
        aria-label={label || "Upload image"}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
        className={`relative rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
          dragging ? "border-cyan-400 bg-cyan-400/10 scale-[1.01]" : "border-[var(--border2)] hover:border-cyan-400/60 hover:bg-cyan-400/[0.04]"
        } ${compact ? "p-4" : "p-6"}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/bmp,image/webp,image/jpeg"
          className="hidden"
          aria-hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
        />
        {preview ? (
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <img src={preview} alt="Uploaded preview" className="w-20 h-20 rounded-xl object-cover border border-cyan-400/30" />
              <span className="absolute -bottom-1.5 -right-1.5 bg-emerald-400 text-[#06121a] rounded-full p-0.5">
                <CheckCircle2 size={14} />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate font-display">{fileName}</p>
              <p className="text-xs opacity-60 font-mono2 mt-0.5">{fileType}</p>
              <span className="inline-flex items-center gap-1.5 text-xs text-cyan-300 mt-1.5 font-medium">
                <RefreshCw size={12} /> Click or drop to replace
              </span>
            </div>
            <img src={preview} alt="" aria-hidden className="hidden md:block w-24 h-16 rounded-lg object-cover opacity-50 blur-[1px]" />
          </div>
        ) : (
          <div className={`flex flex-col items-center text-center ${compact ? "py-2" : "py-4"}`}>
            <span className="w-12 h-12 rounded-2xl grid place-items-center bg-gradient-to-br from-cyan-400/20 to-violet-500/20 border border-cyan-400/30 float-y">
              <ImagePlus size={22} className="text-cyan-300" />
            </span>
            <p className="mt-3 text-sm font-semibold font-display">
              Drag &amp; drop your image <span className="opacity-50 font-normal">or</span> <span className="neon-text">browse</span>
            </p>
            <p className="text-xs opacity-55 mt-1 font-mono2">PNG · BMP · WebP &nbsp;—&nbsp; JPEG shows a warning</p>
          </div>
        )}
      </div>
      {jpegWarn && (
        <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3.5 py-2.5 text-[13px]" role="alert">
          <FileWarning size={17} className="text-amber-300 shrink-0 mt-0.5" />
          <p className="text-amber-200/90 leading-relaxed">
            <strong>JPEG detected — lossy compression destroys hidden bits.</strong> The app re-renders it to a lossless
            canvas, but always export &amp; share as <span className="font-mono2 font-bold">PNG</span> to preserve the payload.
          </p>
        </div>
      )}
    </div>
  );
}
