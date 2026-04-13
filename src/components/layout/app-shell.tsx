import { MobileNav, Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[1920px] gap-2 px-2 py-2 sm:gap-3 sm:px-3 sm:py-3 lg:gap-4 lg:px-4 lg:py-4">
        <Sidebar />
        <div className="relative flex min-h-[calc(100vh-1rem)] flex-1 flex-col overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02] p-2 shadow-[0_16px_52px_rgba(0,0,0,0.28)] sm:rounded-[24px] sm:p-3 md:rounded-[26px] md:p-4 lg:rounded-[28px] lg:p-5">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(0,212,255,0.06),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(0,255,136,0.05),transparent_28%)]" />
          <Topbar />
          <div className="mt-2 sm:mt-3 md:mt-4">
            <MobileNav />
          </div>
          <main className="relative mt-2 flex-1 sm:mt-3 md:mt-4">{children}</main>
        </div>
      </div>
    </div>
  );
}
