type Tone = "amber" | "rose" | "emerald" | "slate";

const TONE_CLASSES: Record<Tone, string> = {
  amber: "bg-amber-100 text-amber-800",
  rose: "bg-rose-100 text-rose-800",
  emerald: "bg-emerald-100 text-emerald-800",
  slate: "bg-slate-100 text-slate-700",
};

export default function Badge({
  tone = "slate",
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
