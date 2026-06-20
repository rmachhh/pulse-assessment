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
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-zinc-950/70 p-6 backdrop-blur-sm">
      <div className="glass-panel animate-modal-in relative w-full max-w-sm overflow-hidden rounded-lg p-6 text-center text-zinc-100 shadow-2xl">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-300 via-emerald-300 to-amber-200" />
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-emerald-200/30 bg-emerald-300/10">
          <span className="live-orb" aria-hidden="true" />
        </div>

        <h2 className="text-balance text-xl font-semibold tracking-tight text-white">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">{subtitle}</p>
        )}

        <div className="mt-6 flex gap-3">
          <button
            onClick={onDecline}
            className="flex-1 rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-white/30 hover:bg-white/10 active:scale-95"
          >
            {declineLabel}
          </button>
          <button
            onClick={onAccept}
            className="flex-1 rounded-full bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-emerald-950/30 transition hover:bg-cyan-200 active:scale-95"
          >
            {acceptLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
