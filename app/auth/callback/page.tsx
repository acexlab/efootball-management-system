import { Suspense } from "react";
import { AuthCallbackClient } from "@/components/pages/auth-callback-client";

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#0b0f14] px-4">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-8 text-center">
            <p className="text-sm uppercase tracking-[0.24em] text-[color:var(--text-muted)]">Auth Callback</p>
            <h1
              className="mt-3 text-3xl font-black uppercase tracking-[0.14em] text-white"
              style={{ fontFamily: "\"Orbitron\", sans-serif" }}
            >
              Shield
            </h1>
            <p className="mt-4 text-sm text-[color:var(--text-muted)]">Completing sign-in...</p>
          </div>
        </main>
      }
    >
      <AuthCallbackClient />
    </Suspense>
  );
}
