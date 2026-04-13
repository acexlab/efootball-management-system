export function Panel({
  children,
  className = ""
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`panel rounded-2xl sm:rounded-[28px] ${className}`}>{children}</section>;
}
