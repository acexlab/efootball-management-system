export function SectionHeading({
  eyebrow,
  title
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-2 sm:gap-3">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-[0.32em] text-[color:var(--text-muted)] truncate">{eyebrow}</p>
        <h2
          className="mt-1 sm:mt-2 text-xl sm:text-2xl md:text-3xl font-black uppercase tracking-[0.1em] text-white"
          style={{ fontFamily: "\"Orbitron\", sans-serif" }}
        >
          {title}
        </h2>
      </div>
    </div>
  );
}
