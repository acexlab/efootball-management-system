type Tone = "success" | "info" | "warning" | "danger" | "neutral";

const toneStyles: Record<Tone, string> = {
  success: "border-[#00FF88]/30 bg-[#00FF88]/12 text-[#00FF88]",
  info: "border-[#00D4FF]/30 bg-[#00D4FF]/12 text-[#00D4FF]",
  warning: "border-[#FFD166]/30 bg-[#FFD166]/12 text-[#FFD166]",
  danger: "border-[#FF5470]/30 bg-[#FF5470]/12 text-[#FF5470]",
  neutral: "border-white/10 bg-white/[0.05] text-white"
};

export function StatusPill({
  label,
  tone = "neutral"
}: {
  label: string;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 sm:px-3 py-0.5 sm:py-1 text-xs font-semibold uppercase tracking-[0.22em] truncate max-w-[180px] ${toneStyles[tone]}`}
    >
      {label}
    </span>
  );
}
