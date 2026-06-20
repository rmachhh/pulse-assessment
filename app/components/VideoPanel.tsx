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
    <div className="absolute inset-0 z-30 flex flex-col bg-[#040406] text-zinc-100">
      <div className="relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_center,rgba(103,232,249,0.16),transparent_32%),radial-gradient(circle_at_65%_38%,rgba(251,191,36,0.12),transparent_30%),#050507]">
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          className="absolute inset-0 h-full w-full bg-zinc-950 object-contain"
        />
        {!remoteStream && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <div>
              <div className="radar-mini mx-auto mb-5">
                <span className="brand-glyph brand-glyph-sm" />
              </div>
              <p className="text-base font-medium text-zinc-100">
                Waiting for stranger&rsquo;s video
              </p>
              <p className="mt-2 text-sm text-zinc-500">
                Camera stream will appear here.
              </p>
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/80 to-transparent" />
        <div className="control-deck absolute left-3 right-3 top-3 flex items-center justify-between rounded-lg px-3 py-2 text-xs sm:left-5 sm:right-auto sm:top-5 sm:min-w-64">
          <div>
            <p className="font-medium text-white">Video call</p>
            <p className="text-zinc-500">You are together now</p>
          </div>
          <span className="h-2 w-2 rounded-full bg-rose-300 shadow-[0_0_14px_rgba(253,164,175,0.8)]" />
        </div>
        <video
          ref={localRef}
          autoPlay
          playsInline
          muted
          className="absolute bottom-5 right-4 z-10 h-40 w-28 rounded-lg border border-white/20 bg-zinc-900 object-cover shadow-2xl shadow-black/50 sm:bottom-6 sm:right-6 sm:h-52 sm:w-36"
        />
      </div>
      <div className="flex shrink-0 justify-center border-t border-white/10 bg-[#07070a]/95 p-4 backdrop-blur">
        <button
          onClick={onEnd}
          className="rounded-full bg-rose-300 px-8 py-3 font-semibold text-zinc-950 shadow-lg shadow-rose-950/30 transition hover:bg-rose-200 active:scale-95"
        >
          End video
        </button>
      </div>
    </div>
  );
}
