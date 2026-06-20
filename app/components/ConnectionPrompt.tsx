"use client";

export default function ConnectionPrompt({
  title,
  subtitle,
  acceptLabel,
  declineLabel,
  onAccept,
  onDecline,
}: {
  title: string;
  subtitle?: string;
  acceptLabel: string;
  declineLabel: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#050507]/75 p-6 backdrop-blur-md">
      <div className="control-deck animate-modal-in relative w-full max-w-md overflow-hidden rounded-lg p-6 text-zinc-100 shadow-2xl">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-200 via-emerald-200 to-amber-200" />

        <div className="flex items-start gap-4">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
            <span className="live-orb" aria-hidden="true" />
            <span className="absolute inset-0 rounded-full border border-cyan-200/10" />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-cyan-200/80">
              Incoming signal
            </p>
            <h2 className="mt-2 text-balance text-2xl font-semibold tracking-normal text-white">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Signal handshake</span>
            <span className="text-emerald-100">waiting</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-3/5 animate-pulse rounded-full bg-gradient-to-r from-cyan-200 via-emerald-200 to-amber-200" />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={onDecline}
            className="flex-1 rounded-full border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-zinc-200 transition hover:border-white/30 hover:bg-white/10 active:scale-95"
          >
            {declineLabel}
          </button>
          <button
            onClick={onAccept}
            className="flex-1 rounded-full bg-white px-4 py-3 text-sm font-semibold text-zinc-950 shadow-lg shadow-cyan-950/30 transition hover:bg-cyan-100 active:scale-95"
          >
            {acceptLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
