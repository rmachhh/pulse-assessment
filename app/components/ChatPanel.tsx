"use client";

import { useEffect, useRef, useState } from "react";

export interface ChatMessage {
  id: number;
  mine: boolean;
  text: string;
}

export default function ChatPanel({
  messages,
  connected,
  videoBusy,
  onSend,
  onStartVideo,
  onEnd,
}: {
  messages: ChatMessage[];
  connected: boolean;
  videoBusy: boolean;
  onSend: (text: string) => void;
  onStartVideo: () => void;
  onEnd: () => void;
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !connected) return;
    onSend(text);
    setDraft("");
  }

  return (
    <aside className="control-deck absolute inset-x-3 bottom-3 z-20 flex max-h-[min(80vh,740px)] flex-col overflow-hidden rounded-lg text-zinc-100 shadow-2xl sm:inset-y-4 sm:left-auto sm:right-4 sm:max-h-none sm:w-[min(430px,calc(100vw-2rem))]">
      <header className="relative overflow-hidden border-b border-white/10 px-4 py-4">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-200 via-emerald-200 to-amber-200" />
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  connected
                    ? "bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.8)]"
                    : "bg-amber-300"
                }`}
              />
              <p className="truncate text-base font-semibold tracking-tight">
                Private signal
              </p>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              {connected ? "Peer-to-peer channel open" : "Opening private path"}
            </p>
          </div>
          <button
            onClick={onEnd}
            className="rounded-full bg-rose-400 px-3.5 py-2 text-sm font-semibold text-zinc-950 shadow-lg shadow-rose-950/30 transition hover:bg-rose-300 active:scale-95"
          >
            End
          </button>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_auto] items-center gap-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full bg-gradient-to-r from-cyan-300 via-emerald-300 to-amber-200 transition-all duration-700 ${
                connected ? "w-full" : "w-1/2 animate-pulse"
              }`}
            />
          </div>
          <button
            onClick={onStartVideo}
            disabled={!connected || videoBusy}
            className="rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-sm font-medium text-zinc-100 transition hover:border-cyan-200/40 hover:bg-cyan-200/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Video
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-[11px] text-zinc-400">
          <div className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-2">
            <p className="font-medium text-zinc-100">{messages.length}</p>
            <p>messages</p>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-2">
            <p className="font-medium text-emerald-100">Live</p>
            <p>session</p>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-2">
            <p className="font-medium text-amber-100">Fresh</p>
            <p>history</p>
          </div>
        </div>
      </header>

      <div className="chat-scroll flex-1 space-y-3 overflow-y-auto bg-black/[0.12] px-4 py-5">
        {messages.length === 0 && (
          <div className="mx-auto mt-8 max-w-60 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-cyan-200/20 bg-cyan-200/10">
              <span className="brand-glyph brand-glyph-xs" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-zinc-200">Room is open.</p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              The conversation disappears when either side leaves.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`animate-msg-in flex ${m.mine ? "justify-end" : "justify-start"}`}
          >
            <span
              className={`max-w-[82%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed shadow-lg ${
                m.mine
                  ? "bg-gradient-to-br from-emerald-300 to-cyan-300 text-zinc-950 shadow-emerald-950/20"
                  : "border border-white/10 bg-white/[0.08] text-zinc-100 shadow-black/20"
              }`}
            >
              {m.text}
            </span>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={submit}
        className="flex gap-2 border-t border-white/10 bg-zinc-950/45 p-3"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={connected ? "Type a message…" : "Connecting…"}
          disabled={!connected}
          className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/25 px-4 py-2.5 text-sm outline-none transition placeholder:text-zinc-600 focus:border-emerald-200/40 focus:ring-2 focus:ring-emerald-300/20 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!connected || !draft.trim()}
          className="rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-cyan-950/20 transition hover:bg-cyan-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </aside>
  );
}
