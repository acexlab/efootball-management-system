import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg sm:rounded-xl md:rounded-[28px] border border-dashed border-white/12 bg-black/20 p-4 sm:p-6 md:p-8 text-center">
      <div className="mx-auto flex h-12 w-12 sm:h-13 sm:w-13 md:h-14 md:w-14 items-center justify-center rounded-lg sm:rounded-xl md:rounded-2xl border border-white/10 bg-white/[0.03]">
        <Icon className="h-5 w-5 sm:h-5.5 sm:w-5.5 md:h-6 md:w-6 text-[#00D4FF]" />
      </div>
      <h3 className="mt-3 sm:mt-4 md:mt-5 text-base sm:text-lg md:text-xl font-semibold text-white">{title}</h3>
      <p className="mx-auto mt-2 sm:mt-3 max-w-xl text-xs sm:text-sm leading-5 sm:leading-6 md:leading-7 text-[color:var(--text-muted)]">
        {description}
      </p>
      {action ? <div className="mt-3 sm:mt-4 md:mt-5">{action}</div> : null}
    </div>
  );
}
