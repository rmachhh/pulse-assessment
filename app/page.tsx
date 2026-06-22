"use client";

import { useEffect, useRef, useState } from "react";
import EntryGate from "./components/EntryGate";
import WorldMap from "./components/WorldMap";
import ConnectionPrompt from "./components/ConnectionPrompt";
import ChatPanel, { type ChatMessage } from "./components/ChatPanel";
import VideoPanel from "./components/VideoPanel";
import { join, leave, poll, sendSignal } from "@/lib/api";
import {
  PeerSession,
  type DescType,
  type PeerControl,
  type PeerPresence,
} from "@/lib/webrtc";
import { POLL_INTERVAL_MS } from "@/lib/presence";
import { type PeerDot, type SignalMsg } from "@/lib/types";

type Conn =
  | { kind: "idle" }
  | { kind: "requesting"; peerId: string }
  | { kind: "incoming"; peerId: string }
  | { kind: "connecting"; peerId: string }
  | { kind: "connected"; peerId: string };

type VideoState = "none" | "requesting" | "incoming" | "active";
type BridgePulse = {
  id: number;
  peerId: string;
  direction: "out" | "in";
};
type LiveEcho = {
  visible: boolean;
  x: number;
  y: number;
  tap: { id: number; x: number; y: number } | null;
};
type GoodbyeBloom = {
  id: number;
  lat: number;
  lng: number;
  messages: number;
};
type PassportStamp = {
  id: number;
  distanceKm: number;
  messages: number;
  endedAt: string;
};
type PulsePassport = {
  bridges: number;
  messages: number;
  distanceKm: number;
  vanishedRooms: number;
  stamps: PassportStamp[];
};

const REQUEST_TIMEOUT_MS = 30_000;
const PULSE_PROMPTS = [
  "Send one thing you can see from where you are.",
  "What does your sky look like right now?",
  "Describe your city in three words.",
  "What is one sound near you?",
  "Send a color from your day.",
  "What is something ordinary that feels beautiful today?",
  "What would you show a stranger if they stood beside you?",
];

function promptIndexForPair(a: string, b: string) {
  const seed = [a, b].sort().join(":");
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % PULSE_PROMPTS.length;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const radiusKm = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

export default function Home() {
  const [phase, setPhase] = useState<"gate" | "live">("gate");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [peers, setPeers] = useState<PeerDot[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [bridgePulses, setBridgePulses] = useState<BridgePulse[]>([]);
  const [remoteEcho, setRemoteEcho] = useState<LiveEcho>({
    visible: false,
    x: 0.5,
    y: 0.5,
    tap: null,
  });
  const [remoteTyping, setRemoteTyping] = useState(false);
  const [goodbyeBloom, setGoodbyeBloom] = useState<GoodbyeBloom | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [passport, setPassport] = useState<PulsePassport>({
    bridges: 0,
    messages: 0,
    distanceKm: 0,
    vanishedRooms: 0,
    stamps: [],
  });
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );

  const [conn, _setConn] = useState<Conn>({ kind: "idle" });
  const connRef = useRef<Conn>(conn);
  const setConn = (c: Conn) => {
    connRef.current = c;
    _setConn(c);
  };

  const [video, _setVideo] = useState<VideoState>("none");
  const videoRef = useRef<VideoState>(video);
  const setVideo = (v: VideoState) => {
    videoRef.current = v;
    _setVideo(v);
  };

  const peerRef = useRef<PeerSession | null>(null);
  const msgId = useRef(0);
  const pulseId = useRef(0);
  const echoTapId = useRef(0);
  const echoHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const echoTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peersRef = useRef<PeerDot[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const goodbyeId = useRef(0);
  const lastBridgePeerRef = useRef<string | null>(null);
  const currentBridgeDistanceRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    peersRef.current = peers;
  }, [peers]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  function showNotice(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice(null), 3500);
  }

  function playTone(kind: "enable" | "connect" | "message" | "goodbye") {
    if (!soundEnabledRef.current || typeof window === "undefined") return;
    try {
      const Ctx = window.AudioContext;
      const ctx = audioCtxRef.current ?? new Ctx();
      audioCtxRef.current = ctx;

      const frequencies =
        kind === "enable"
          ? [523.25, 783.99]
          : kind === "connect"
          ? [392, 523.25]
          : kind === "goodbye"
            ? [329.63, 246.94]
            : [659.25];
      const peak =
        kind === "message" ? 0.075 : kind === "goodbye" ? 0.09 : 0.11;
      const release =
        kind === "goodbye" ? 0.5 : kind === "enable" ? 0.34 : 0.26;

      const startTone = () => {
        const now = ctx.currentTime;
        const gain = ctx.createGain();
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(frequencies[0], now);
        if (frequencies[1]) {
          osc.frequency.exponentialRampToValueAtTime(frequencies[1], now + 0.18);
        }
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(peak, now + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + release);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + release + 0.04);
      };

      if (ctx.state === "suspended") {
        void ctx.resume().then(startTone).catch(() => {});
      } else {
        startTone();
      }
    } catch {}
  }

  function handleToggleSound() {
    setSoundEnabled((enabled) => {
      const next = !enabled;
      soundEnabledRef.current = next;
      if (next) playTone("enable");
      return next;
    });
  }

  function addMessage(mine: boolean, text: string) {
    setMessages((prev) => [...prev, { id: msgId.current++, mine, text }]);
    setPassport((prev) => ({ ...prev, messages: prev.messages + 1 }));
  }

  function launchBridgePulse(direction: BridgePulse["direction"], peerId?: string) {
    const c = connRef.current;
    const activePeer =
      peerId ?? (c.kind === "connecting" || c.kind === "connected" ? c.peerId : null);
    if (!activePeer) return;
    const nextPulse = {
      id: pulseId.current++,
      peerId: activePeer,
      direction,
    };
    setBridgePulses((prev) => [...prev.slice(-10), nextPulse]);
  }

  function clearLiveEcho() {
    if (echoHideTimer.current) clearTimeout(echoHideTimer.current);
    if (echoTapTimer.current) clearTimeout(echoTapTimer.current);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    echoHideTimer.current = null;
    echoTapTimer.current = null;
    typingTimer.current = null;
    setRemoteEcho({ visible: false, x: 0.5, y: 0.5, tap: null });
    setRemoteTyping(false);
  }

  function sendPresence(presence: PeerPresence) {
    peerRef.current?.sendPresence(presence);
  }

  function handlePresence(presence: PeerPresence) {
    if (presence.kind === "typing") {
      if (!presence.active) {
        if (typingTimer.current) clearTimeout(typingTimer.current);
        setRemoteTyping(false);
        return;
      }

      setRemoteTyping(true);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setRemoteTyping(false), 1800);
      return;
    }

    if (echoHideTimer.current) clearTimeout(echoHideTimer.current);
    setRemoteEcho((prev) => ({
      ...prev,
      visible: true,
      x: presence.x,
      y: presence.y,
      tap:
        presence.kind === "tap"
          ? { id: echoTapId.current++, x: presence.x, y: presence.y }
          : prev.tap,
    }));

    if (presence.kind === "tap") {
      if (echoTapTimer.current) clearTimeout(echoTapTimer.current);
      echoTapTimer.current = setTimeout(() => {
        setRemoteEcho((prev) => ({ ...prev, tap: null }));
      }, 900);
    }

    echoHideTimer.current = setTimeout(() => {
      setRemoteEcho((prev) => ({ ...prev, visible: false }));
    }, 2400);
  }

  function teardown(message?: string) {
    if (requestTimer.current) clearTimeout(requestTimer.current);
    // Let the server clear busy flags on both peers.
    const c = connRef.current;
    if (c.kind === "connecting" || c.kind === "connected") {
      const peer = peersRef.current.find((p) => p.id === c.peerId);
      const bloomPoint =
        peer ?? (myLocation ? { lat: myLocation.lat, lng: myLocation.lng } : null);
      if (bloomPoint) {
        const stamp = {
          id: goodbyeId.current,
          distanceKm: currentBridgeDistanceRef.current,
          messages: messagesRef.current.length,
          endedAt: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
        setGoodbyeBloom({
          id: goodbyeId.current++,
          lat: bloomPoint.lat,
          lng: bloomPoint.lng,
          messages: messagesRef.current.length,
        });
        setPassport((prev) => ({
          ...prev,
          vanishedRooms: prev.vanishedRooms + 1,
          stamps: [stamp, ...prev.stamps].slice(0, 3),
        }));
        playTone("goodbye");
      }
    }
    if (sessionId && (c.kind === "connecting" || c.kind === "connected")) {
      void sendSignal(sessionId, c.peerId, "end");
    }
    peerRef.current?.close();
    peerRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setVideo("none");
    setMessages([]);
    clearLiveEcho();
    lastBridgePeerRef.current = null;
    currentBridgeDistanceRef.current = 0;
    setConn({ kind: "idle" });
    if (message) showNotice(message);
  }

  const teardownRef = useRef(teardown);
  useEffect(() => {
    teardownRef.current = teardown;
  });

  function startPeer(peerId: string, initiator: boolean) {
    if (!sessionId) return;
    const ps = new PeerSession(initiator, {
      onSignal: (type: DescType, payload: string) => {
        void sendSignal(sessionId, peerId, type, payload);
      },
      onChat: (text) => {
        addMessage(false, text);
        launchBridgePulse("in", peerId);
        playTone("message");
      },
      onControl: (ctrl) => handleControl(ctrl),
      onPresence: (presence) => handlePresence(presence),
      onRemoteStream: (stream) => setRemoteStream(stream),
      onConnectionState: (state) => {
        if (state === "disconnected" || state === "failed") {
          teardown("Connection lost.");
        }
      },
      onChannelOpen: () => {
        setConn({ kind: "connected", peerId });
      },
    });
    peerRef.current = ps;
  }

  function handleControl(ctrl: PeerControl) {
    const ps = peerRef.current;
    switch (ctrl) {
      case "video-request":
        if (videoRef.current === "none") setVideo("incoming");
        break;
      case "video-accept":
        if (videoRef.current === "requesting" && ps) {
          ps.startVideo()
            .then((stream) => {
              setLocalStream(stream);
              setVideo("active");
            })
            .catch(() => {
              setVideo("none");
              ps.sendControl("video-end");
              showNotice("Camera unavailable.");
            });
        }
        break;
      case "video-decline":
        if (videoRef.current === "requesting") {
          setVideo("none");
          showNotice("Video declined.");
        }
        break;
      case "video-end":
        ps?.stopVideo();
        setLocalStream(null);
        setRemoteStream(null);
        setVideo("none");
        break;
    }
  }

  function requestConnection(peerId: string) {
    if (!sessionId || connRef.current.kind !== "idle") return;
    setConn({ kind: "requesting", peerId });
    void sendSignal(sessionId, peerId, "request");
    requestTimer.current = setTimeout(() => {
      if (
        connRef.current.kind === "requesting" &&
        connRef.current.peerId === peerId
      ) {
        void sendSignal(sessionId, peerId, "end");
        teardown("No answer.");
      }
    }, REQUEST_TIMEOUT_MS);
  }

  function cancelRequest() {
    if (sessionId && connRef.current.kind === "requesting") {
      void sendSignal(sessionId, connRef.current.peerId, "end");
    }
    teardown();
  }

  function acceptIncoming() {
    if (!sessionId || connRef.current.kind !== "incoming") return;
    const peerId = connRef.current.peerId;
    startPeer(peerId, false);
    void sendSignal(sessionId, peerId, "accept");
    setConn({ kind: "connecting", peerId });
  }

  function declineIncoming() {
    if (!sessionId || connRef.current.kind !== "incoming") return;
    void sendSignal(sessionId, connRef.current.peerId, "decline");
    setConn({ kind: "idle" });
  }

  function endConnection() {
    teardown();
  }

  function startVideoRequest() {
    if (videoRef.current !== "none" || !peerRef.current) return;
    setVideo("requesting");
    peerRef.current.sendControl("video-request");
  }

  function acceptVideo() {
    const ps = peerRef.current;
    if (!ps) return;
    ps.startVideo()
      .then((stream) => {
        setLocalStream(stream);
        ps.sendControl("video-accept");
        setVideo("active");
      })
      .catch(() => {
        ps.sendControl("video-decline");
        setVideo("none");
        showNotice("Camera unavailable.");
      });
  }

  function declineVideo() {
    peerRef.current?.sendControl("video-decline");
    setVideo("none");
  }

  function endVideo() {
    const ps = peerRef.current;
    ps?.stopVideo();
    ps?.sendControl("video-end");
    setLocalStream(null);
    setRemoteStream(null);
    setVideo("none");
  }

  function processSignal(sig: SignalMsg) {
    if (!sessionId) return;
    switch (sig.type) {
      case "request": {
        if (connRef.current.kind === "idle") {
          setConn({ kind: "incoming", peerId: sig.fromId });
        } else {
          void sendSignal(sessionId, sig.fromId, "decline");
        }
        break;
      }
      case "accept": {
        const c = connRef.current;
        if (c.kind === "requesting" && c.peerId === sig.fromId) {
          if (requestTimer.current) clearTimeout(requestTimer.current);
          startPeer(sig.fromId, true);
          setConn({ kind: "connecting", peerId: sig.fromId });
        }
        break;
      }
      case "decline": {
        const c = connRef.current;
        if (c.kind === "requesting" && c.peerId === sig.fromId) {
          if (requestTimer.current) clearTimeout(requestTimer.current);
          teardown("Request declined.");
        }
        break;
      }
      case "offer":
      case "answer":
      case "ice": {
        const c = connRef.current;
        const peerId =
          c.kind === "connecting" || c.kind === "connected" ? c.peerId : null;
        if (peerRef.current && peerId === sig.fromId) {
          void peerRef.current.handleSignal(
            sig.type as DescType,
            sig.payload ?? "",
          );
        }
        break;
      }
      case "end": {
        const c = connRef.current;
        if (
          (c.kind === "incoming" ||
            c.kind === "connecting" ||
            c.kind === "connected") &&
          c.peerId === sig.fromId
        ) {
          if (c.kind === "incoming") setConn({ kind: "idle" });
          else teardown("Stranger disconnected.");
        }
        break;
      }
    }
  }

  const processSignalRef = useRef(processSignal);
  useEffect(() => {
    processSignalRef.current = processSignal;
  });

  useEffect(() => {
    if (conn.kind !== "connected" || !myLocation) return;
    if (lastBridgePeerRef.current === conn.peerId) return;
    const peer = peersRef.current.find((p) => p.id === conn.peerId);
    const crossedKm = peer ? distanceKm(myLocation, peer) : 0;
    lastBridgePeerRef.current = conn.peerId;
    currentBridgeDistanceRef.current = crossedKm;
    setPassport((prev) => ({
      ...prev,
      bridges: prev.bridges + 1,
      distanceKm: prev.distanceKm + crossedKm,
    }));
    playTone("connect");
  }, [conn, myLocation]);

  useEffect(() => {
    if (phase !== "live" || !sessionId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const data = await poll(sessionId);
        if (!active) return;
        setPeers(data.peers);
        for (const s of data.signals) processSignalRef.current(s);
        // If our connected peer vanished from the map (tab close / crash /
        // force-quit), tear down locally instead of staying stuck.
        const c = connRef.current;
        if (c.kind === "connecting" || c.kind === "connected") {
          if (!data.peers.some((p) => p.id === c.peerId)) {
            teardownRef.current("Stranger disconnected.");
          }
        }
      } catch {}
      if (active) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [phase, sessionId]);

  useEffect(() => {
    if (!sessionId || phase !== "live") return;
    const onLeave = () => leave(sessionId);
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [sessionId, phase]);

  async function handleReady(lat: number, lng: number) {
    setMyLocation({ lat, lng });
    const id = await join(lat, lng);
    setSessionId(id);
    setPhase("live");
  }

  if (phase === "gate") {
    return <EntryGate onReady={handleReady} />;
  }

  const inChat = conn.kind === "connecting" || conn.kind === "connected";
  const bridgePeerId = inChat ? conn.peerId : null;
  const pulsePrompt =
    sessionId && bridgePeerId
      ? PULSE_PROMPTS[promptIndexForPair(sessionId, bridgePeerId)]
      : null;

  return (
    <main className="fixed inset-0 overflow-hidden">
      <WorldMap
        peers={peers}
        me={myLocation}
        bridgePeerId={bridgePeerId}
        bridgePulses={bridgePulses}
        goodbyeBloom={goodbyeBloom}
        passport={passport}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        onPeerClick={requestConnection}
        canConnect={conn.kind === "idle"}
      />

      {notice && (
        <div className="control-deck animate-modal-in absolute left-1/2 top-20 z-30 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-medium text-zinc-100 shadow-lg">
          {notice}
        </div>
      )}

      {conn.kind === "requesting" && (
        <div className="control-deck animate-modal-in absolute left-1/2 top-20 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full px-4 py-2 text-sm text-zinc-100 shadow-lg">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-200 shadow-[0_0_16px_rgba(253,230,138,0.8)]" />
          <span>Asking to connect…</span>
          <button
            onClick={cancelRequest}
            className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium transition hover:bg-white/20 active:scale-95"
          >
            Cancel
          </button>
        </div>
      )}

      {conn.kind === "incoming" && (
        <ConnectionPrompt
          title="A stranger wants to connect"
          acceptLabel="Accept"
          declineLabel="Decline"
          onAccept={acceptIncoming}
          onDecline={declineIncoming}
        />
      )}

      {inChat && (
        <ChatPanel
          messages={messages}
          connected={conn.kind === "connected"}
          videoBusy={video !== "none"}
          pulsePrompt={messages.length === 0 ? pulsePrompt : null}
          onSend={(text) => {
            peerRef.current?.sendChat(text);
            addMessage(true, text);
            launchBridgePulse("out");
            playTone("message");
            sendPresence({ kind: "typing", active: false });
          }}
          remoteEcho={remoteEcho}
          remoteTyping={remoteTyping}
          onEchoCursor={(x, y) => sendPresence({ kind: "cursor", x, y })}
          onEchoTap={(x, y) => sendPresence({ kind: "tap", x, y })}
          onEchoTyping={(active) => sendPresence({ kind: "typing", active })}
          onStartVideo={startVideoRequest}
          onEnd={endConnection}
        />
      )}

      {video === "requesting" && (
        <div className="control-deck animate-modal-in absolute bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-medium text-zinc-100 shadow-lg">
          Waiting for video response…
        </div>
      )}

      {video === "incoming" && (
        <ConnectionPrompt
          title="Start video call?"
          subtitle="The stranger wants to turn on video."
          acceptLabel="Accept"
          declineLabel="Decline"
          onAccept={acceptVideo}
          onDecline={declineVideo}
        />
      )}

      {video === "active" && (
        <VideoPanel
          localStream={localStream}
          remoteStream={remoteStream}
          onEnd={endVideo}
        />
      )}
    </main>
  );
}
