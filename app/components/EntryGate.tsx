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
    <div className="relative flex min-h-full flex-1 flex-col items-center justify-center gap-10 overflow-hidden bg-zinc-950 px-6 py-12 text-zinc-100">
      {/* Ambient background: radial gradient + subtle noise feel */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(16,185,129,0.08)_0%,_transparent_70%)]" />

      {/* Floating background dots */}
      <div
        className="pointer-events-none absolute h-2 w-2 rounded-full bg-emerald-400/30"
        style={{
          left: "15%",
          top: "25%",
          animation: "float-1 6s ease-in-out infinite",
        }}
      />
      <div
        className="pointer-events-none absolute h-1.5 w-1.5 rounded-full bg-emerald-400/20"
        style={{
          right: "20%",
          top: "30%",
          animation: "float-2 8s ease-in-out infinite",
        }}
      />
      <div
        className="pointer-events-none absolute h-2.5 w-2.5 rounded-full bg-emerald-400/25"
        style={{
          left: "25%",
          bottom: "30%",
          animation: "float-3 7s ease-in-out infinite",
        }}
      />
      <div
        className="pointer-events-none absolute h-1.5 w-1.5 rounded-full bg-emerald-400/20"
        style={{
          right: "25%",
          bottom: "25%",
          animation: "float-1 5s ease-in-out infinite 1s",
        }}
      />
      <div
        className="pointer-events-none absolute h-1 w-1 rounded-full bg-white/10"
        style={{
          left: "60%",
          top: "20%",
          animation: "float-2 9s ease-in-out infinite 2s",
        }}
      />

      {/* Logo */}
      <div className="flex flex-col items-center gap-8">
        {/* Pulsing logo ring */}
        <div className="animate-logo-ring relative flex h-32 w-32 items-center justify-center rounded-full bg-emerald-400/10 ring-1 ring-emerald-400/25">
          <div className="animate-logo-pulse flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-300 to-emerald-500 shadow-2xl shadow-emerald-400/50">
            <div className="h-3.5 w-3.5 rounded-full bg-zinc-950" />
          </div>
        </div>

        {/* Title */}
        <div className="text-center">
          <h1 className="bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-6xl font-bold tracking-tight text-transparent">
            Pulse
          </h1>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-zinc-500">
            A living globe of anonymous strangers.
            <br />
            Drop onto the map and connect.
          </p>
        </div>
      </div>

      {/* Button */}
      <button
        onClick={enter}
        disabled={status === "locating"}
        className="group relative rounded-full bg-emerald-400 px-10 py-3.5 text-base font-semibold text-zinc-950 shadow-lg shadow-emerald-400/30 transition-all duration-300 hover:bg-emerald-300 hover:shadow-emerald-400/50 hover:scale-105 active:scale-95 disabled:opacity-60 disabled:hover:scale-100 disabled:hover:bg-emerald-400 disabled:hover:shadow-emerald-400/30"
      >
        {/* Inner glow on hover */}
        <span className="absolute inset-0 rounded-full bg-white/0 transition-colors group-hover:bg-white/10" />
        {status === "locating" ? (
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-950/60" />
            Locating…
          </span>
        ) : (
          "Enter Pulse"
        )}
      </button>

      {/* Error */}
      {status === "error" && (
        <p className="-mt-4 max-w-xs text-center text-sm text-red-400 animate-modal-in">
          {error}
        </p>
      )}

      {/* Footer */}
      <p className="absolute bottom-6 max-w-sm text-center text-xs leading-relaxed text-zinc-700">
        No sign-up. Your dot is placed 1–3 km from your real location.
        <br />
        Nothing is stored — closing the tab ends everything.
      </p>
    </div>
  );
}
