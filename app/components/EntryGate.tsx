"use client";

import { useState } from "react";

export default function EntryGate({
  onReady,
}: {
  onReady: (lat: number, lng: number) => void;
}) {
  const [status, setStatus] = useState<"idle" | "locating" | "error">("idle");
  const [error, setError] = useState<string>("");

  function enter() {
    if (!("geolocation" in navigator)) {
      setStatus("error");
      setError("Your browser doesn't support location access.");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => onReady(pos.coords.latitude, pos.coords.longitude),
      (err) => {
        setStatus("error");
        if (err.code === err.PERMISSION_DENIED) {
          setError(
            !window.isSecureContext
              ? "Location requires a secure connection. Open this page over HTTPS or localhost."
              : "Location access was denied. Check your browser and device location settings, then try again.",
          );
        } else {
          setError("Couldn't get your location. Please try again.");
        }
      },
      { enableHighAccuracy: true, timeout: 30_000, maximumAge: 60_000 },
    );
  }

  return (
    <div className="entry-shell relative flex min-h-full flex-1 flex-col items-center justify-center overflow-hidden bg-[#07070a] px-6 py-16 text-zinc-100 sm:py-12">
      <div className="entry-grid" aria-hidden="true" />
      <div className="entry-aurora entry-aurora-a" aria-hidden="true" />
      <div className="entry-aurora entry-aurora-b" aria-hidden="true" />

      <div className="pointer-events-none absolute left-[15%] top-[24%] h-2 w-2 rounded-full bg-cyan-200/35 shadow-[0_0_22px_rgba(103,232,249,0.45)] [animation:float-1_6s_ease-in-out_infinite]" />
      <div className="pointer-events-none absolute right-[18%] top-[31%] h-1.5 w-1.5 rounded-full bg-emerald-200/30 shadow-[0_0_18px_rgba(110,231,183,0.38)] [animation:float-2_8s_ease-in-out_infinite]" />
      <div className="pointer-events-none absolute bottom-[26%] left-[24%] h-2.5 w-2.5 rounded-full bg-amber-200/25 shadow-[0_0_18px_rgba(253,230,138,0.32)] [animation:float-3_7s_ease-in-out_infinite]" />
      <div className="pointer-events-none absolute bottom-[24%] right-[26%] h-1.5 w-1.5 rounded-full bg-rose-200/20 shadow-[0_0_16px_rgba(253,164,175,0.28)] [animation:float-1_5s_ease-in-out_infinite_1s]" />

      <div className="relative z-10 flex w-full max-w-xl flex-col items-center text-center">
        <div className="relative flex h-48 w-48 items-center justify-center sm:h-56 sm:w-56">
          <div className="absolute inset-0 rounded-full border border-cyan-200/10 bg-white/[0.02] shadow-[inset_0_0_70px_rgba(103,232,249,0.08)]" />
          <div className="absolute inset-8 rounded-full border border-emerald-200/10 [animation:slow-spin_18s_linear_infinite]" />
          <div className="absolute inset-16 rounded-full border border-dashed border-amber-200/20 [animation:slow-spin_12s_linear_infinite_reverse]" />
          <div className="radar-sweep" />
          <span className="brand-glyph brand-glyph-lg" aria-hidden="true" />
          <span className="absolute h-3 w-3 translate-x-20 -translate-y-10 rounded-full bg-cyan-200 shadow-[0_0_28px_rgba(103,232,249,0.75)]" />
          <span className="absolute h-2.5 w-2.5 -translate-x-20 translate-y-12 rounded-full bg-emerald-200 shadow-[0_0_24px_rgba(110,231,183,0.7)]" />
        </div>

        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.32em] text-cyan-200/80">
          anonymous global presence
        </p>
        <h1 className="mt-4 bg-gradient-to-b from-white via-zinc-100 to-zinc-500 bg-clip-text text-6xl font-semibold tracking-normal text-transparent sm:text-7xl">
          Pulse
        </h1>
        <p className="mt-4 max-w-sm text-sm leading-7 text-zinc-400">
          A living globe of anonymous strangers. Drop onto the map and connect
          for a private, temporary room.
        </p>

        <button
          onClick={enter}
          disabled={status === "locating"}
          className="group relative mt-9 inline-flex min-h-14 min-w-44 items-center justify-center overflow-hidden rounded-full bg-white px-8 text-sm font-semibold text-zinc-950 shadow-2xl shadow-cyan-950/40 transition hover:bg-cyan-100 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
        >
          <span className="absolute inset-0 translate-x-[-120%] bg-gradient-to-r from-transparent via-cyan-200/70 to-transparent transition duration-700 group-hover:translate-x-[120%]" />
          {status === "locating" ? (
            <span className="relative flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-950/70" />
              Locating signal
            </span>
          ) : (
            <span className="relative">Enter Pulse</span>
          )}
        </button>

        {status === "error" && (
          <p className="animate-modal-in mt-5 max-w-md rounded-lg border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm leading-relaxed text-rose-100">
            {error}
          </p>
        )}

        <div className="mt-7 flex flex-wrap justify-center gap-2 text-xs text-zinc-500">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
            No sign-up
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
            1-3 km location blur
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
            Nothing stored
          </span>
        </div>
      </div>
    </div>
  );
}
