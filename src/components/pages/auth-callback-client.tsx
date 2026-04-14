"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Completing sign-in...");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const code = searchParams.get("code");

    async function finishSignIn() {
      if (!supabase || !code) {
        setMessage("Sign-in callback is missing a valid session code.");
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        setMessage(`Sign-in could not be completed: ${error.message}`);
        return;
      }

      router.replace("/");
    }

    void finishSignIn();
  }, [router, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0f14] px-4">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-8 text-center">
        <p className="text-sm uppercase tracking-[0.24em] text-[color:var(--text-muted)]">Auth Callback</p>
        <h1
          className="mt-3 text-3xl font-black uppercase tracking-[0.14em] text-white"
          style={{ fontFamily: "\"Orbitron\", sans-serif" }}
        >
          Shield
        </h1>
        <p className="mt-4 text-sm text-[color:var(--text-muted)]">{message}</p>
      </div>
    </main>
  );
}
