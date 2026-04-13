import Image from "next/image";

export function UserAvatar({
  src,
  name,
  className = ""
}: {
  src?: string | null;
  name: string;
  className?: string;
}) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      className={`relative overflow-hidden rounded-lg sm:rounded-xl md:rounded-2xl border border-white/10 bg-gradient-to-br from-[#00FF88]/18 via-[#00D4FF]/14 to-[#7A5CFF]/18 ${className}`}
    >
      {src ? (
        <Image src={src} alt={`${name} avatar`} fill className="object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs sm:text-sm font-semibold uppercase tracking-[0.18em] text-white">
          {initials || "U"}
        </div>
      )}
    </div>
  );
}
