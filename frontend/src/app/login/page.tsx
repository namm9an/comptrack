"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMe } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;

    getMe()
      .then((user) => {
        if (active && user) router.replace("/");
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });

    return () => {
      active = false;
    };
  }, [router]);

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-10">
        <div className="grid w-full items-center gap-10 lg:grid-cols-[1fr_420px]">
          <section className="space-y-8">
            <div className="inline-flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500">
                <span className="text-base font-bold text-white">CT</span>
              </div>
              <div>
                <p className="text-sm font-semibold tracking-wide text-blue-200">CompTrack</p>
                <p className="text-xs text-slate-400">E2E Networks competitor intelligence</p>
              </div>
            </div>

            <div className="max-w-2xl space-y-5">
              <h1 className="text-4xl font-bold tracking-normal text-white md:text-5xl">
                Track competitor movement without the noise.
              </h1>
              <p className="text-lg leading-relaxed text-slate-300">
                Daily digests, tracked companies, job history, and admin controls in one focused workspace.
              </p>
            </div>

            <div className="grid max-w-xl gap-3 sm:grid-cols-3">
              {["Daily digests", "Competitor profiles", "Admin review"].map((label) => (
                <div key={label} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-sm font-medium text-slate-100">{label}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white p-7 text-slate-900 shadow-xl">
            <div className="mb-7">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600">
                <span className="text-lg font-bold text-white">CT</span>
              </div>
              <h2 className="text-2xl font-bold text-slate-950">Sign in</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Sign in with your e2enetworks Gmail account.
              </p>
            </div>

            <a
              href="/auth/google"
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </a>

            <p className="mt-5 text-xs leading-relaxed text-slate-500">
              Use your full e2enetworks.com email address if Google asks you to choose or enter an account.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
