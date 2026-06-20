"use client";

import { useEffect, useRef } from "react";

export default function VideoPanel({
  localStream,
  remoteStream,
  onEnd,
}: {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onEnd: () => void;
}) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localRef.current && localRef.current.srcObject !== localStream) {
      localRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteRef.current && remoteRef.current.srcObject !== remoteStream) {
      remoteRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-black text-zinc-100">
      <div className="relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_center,rgba(20,184,166,0.16),rgba(2,6,23,1)_62%)]">
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          className="absolute inset-0 h-full w-full bg-zinc-950 object-contain"
        />
        {!remoteStream && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <div>
              <div className="mx-auto mb-4 h-12 w-12 rounded-full border border-cyan-200/20 bg-cyan-200/10 p-3">
                <span className="block h-full w-full animate-pulse rounded-full bg-cyan-200 shadow-[0_0_28px_rgba(103,232,249,0.5)]" />
              </div>
              <p className="text-sm font-medium text-zinc-200">
                Waiting for stranger&rsquo;s video
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                The call will fill this space when their camera starts.
              </p>
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 to-transparent" />
        <div className="glass-panel absolute left-3 top-3 rounded-lg px-3 py-2 text-xs sm:left-5 sm:top-5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-rose-400 shadow-[0_0_14px_rgba(251,113,133,0.8)]" />
            <span className="font-medium">Live video</span>
          </div>
        </div>
        <video
          ref={localRef}
          autoPlay
          playsInline
          muted
          className="absolute bottom-4 right-4 z-10 h-40 w-28 rounded-lg border border-white/20 bg-zinc-900 object-cover shadow-2xl shadow-black/40 sm:bottom-5 sm:right-5 sm:h-48 sm:w-32"
        />
      </div>
      <div className="flex shrink-0 justify-center border-t border-white/10 bg-zinc-950/95 p-4 backdrop-blur">
        <button
          onClick={onEnd}
          className="rounded-full bg-rose-500 px-8 py-3 font-semibold text-white shadow-lg shadow-rose-950/30 transition hover:bg-rose-400 active:scale-95"
        >
          End video
        </button>
      </div>
    </div>
  );
}
