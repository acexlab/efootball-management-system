export function SectionHeading({
  eyebrow,
  title,
  description
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-2 sm:gap-3">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--text-muted)] break-words sm:text-xs sm:tracking-[0.32em]">
          {eyebrow}
        </p>
        <h2
          className="mt-1 text-lg font-black uppercase leading-tight tracking-[0.06em] break-words text-white sm:mt-2 sm:text-2xl sm:tracking-[0.1em] md:text-3xl"
          style={{ fontFamily: "\"Orbitron\", sans-serif" }}
        >
          {title}
        </h2>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">{description}</p>
        ) : null}
      </div>
    </div>
  );
}
