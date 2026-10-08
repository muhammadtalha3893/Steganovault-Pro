import { useEffect } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";

export interface ToastMsg {
  id: number;
  kind: "success" | "error" | "warn" | "info";
  title: string;
  desc?: string;
}

const icons = {
  success: CheckCircle2,
  error: XCircle,
  warn: AlertTriangle,
  info: Info,
};

const colors: Record<string, string> = {
  success: "border-emerald-400/40",
  error: "border-rose-400/40",
  warn: "border-amber-400/40",
  info: "border-cyan-400/40",
};

export default function Toasts({ toasts, dismiss }: { toasts: ToastMsg[]; dismiss: (id: number) => void }) {
  useEffect(() => {
    if (toasts.length === 0) return;
    const t = setTimeout(() => dismiss(toasts[0].id), 4200);
    return () => clearTimeout(t);
  }, [toasts, dismiss]);

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm" role="status" aria-live="polite">
      {toasts.map((t) => {
        const Icon = icons[t.kind];
        return (
          <div key={t.id} className={`toast-in glass rounded-xl px-4 py-3 flex items-start gap-3 border ${colors[t.kind]}`}>
            <Icon size={18} className="mt-0.5 shrink-0 text-[var(--text)]" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold font-display">{t.title}</div>
              {t.desc && <div className="text-xs opacity-70 mt-0.5 leading-relaxed break-words">{t.desc}</div>}
            </div>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="opacity-50 hover:opacity-100 transition-opacity">
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

let toastId = 1;
export function makeToast(kind: ToastMsg["kind"], title: string, desc?: string): ToastMsg {
  return { id: toastId++, kind, title, desc };
}
