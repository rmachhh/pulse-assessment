"use client";

import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import type { PeerDot } from "@/lib/types";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "pk.eyJ1IjoicHVsc2UtbWFwIiwiYSI6ImNrMDBkZW1vMDAwMDAwMDAifQ.AAAAAAAAAAAAAAAAAAAAAA";

function dotColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return `hsl(${Math.abs(hash) % 360}, 70%, 60%)`;
}

export default function WorldMap({
  peers,
  me,
  onPeerClick,
  canConnect,
}: {
  peers: PeerDot[];
  me: { lat: number; lng: number } | null;
  onPeerClick: (id: string) => void;
  canConnect: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const meMarkerRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);

  // Marker click handlers are bound once, so read the live click handler +
  // connectability through refs (synced in an effect, never during render).
  const onPeerClickRef = useRef(onPeerClick);
  const canConnectRef = useRef(canConnect);
  useEffect(() => {
    onPeerClickRef.current = onPeerClick;
    canConnectRef.current = canConnect;
  });

  // Initialise the map once.
  useEffect(() => {
    if (!TOKEN || !containerRef.current) return;
    let cancelled = false;
    const markers = markersRef.current;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = TOKEN;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/dark-v11",
        // Open centered on the user if we know where they are, else world view.
        center: me ? [me.lng, me.lat] : [0, 20],
        zoom: me ? 4 : 1.4,
        pitch: me ? 48 : 20,
        attributionControl: true,
      });
      map.on("load", () => {
        map.setFog({
          color: "rgba(9, 13, 22, 0.95)",
          "high-color": "rgba(39, 213, 191, 0.2)",
          "horizon-blend": 0.12,
          "space-color": "rgba(2, 6, 23, 1)",
          "star-intensity": 0.35,
        });
        map.addControl(
          new mapboxgl.NavigationControl({ visualizePitch: true }),
          "top-right",
        );
        if (!cancelled) setReady(true);
      });
      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      markers.forEach((m) => m.remove());
      markers.clear();
      meMarkerRef.current?.remove();
      meMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // `me` is only read for the initial center; we don't want to re-init on change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show / move the user's own "you are here" pin.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !me) return;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      if (!meMarkerRef.current) {
        const el = document.createElement("div");
        el.className = "pulse-me";
        el.title = "You are here";
        const label = document.createElement("span");
        label.className = "pulse-me-label";
        label.textContent = "Me";
        const pin = document.createElement("span");
        pin.className = "pulse-me-pin";
        el.append(label, pin);
        // anchor "bottom" → the pin's tip sits on the exact coordinate.
        meMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([me.lng, me.lat])
          .addTo(map);
      } else {
        meMarkerRef.current.setLngLat([me.lng, me.lat]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [me, ready]);

  // Reconcile markers whenever the peer list changes (or the map becomes ready).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      const markers = markersRef.current;
      const seen = new Set<string>();

      for (const peer of peers) {
        seen.add(peer.id);
        let marker = markers.get(peer.id);
        if (!marker) {
          const el = document.createElement("button");
          el.className = "pulse-dot";
          el.style.setProperty("--dot-color", dotColor(peer.id));
          el.title = "Tap to connect";
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            if (canConnectRef.current) onPeerClickRef.current(peer.id);
          });
          marker = new mapboxgl.Marker({ element: el })
            .setLngLat([peer.lng, peer.lat])
            .addTo(map);
          markers.set(peer.id, marker);
        }
        const element = marker.getElement();
        element.classList.toggle("is-busy", peer.busy);
        element.setAttribute("aria-label", peer.busy ? "Peer is busy" : "Tap to connect");
      }

      // Drop markers for peers that went offline / got filtered out.
      for (const [id, marker] of markers) {
        if (!seen.has(id)) {
          marker.remove();
          markers.delete(id);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [peers, ready]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full bg-zinc-900" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,transparent_0%,rgba(2,6,23,0.08)_45%,rgba(2,6,23,0.7)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-zinc-950/80 to-transparent" />

      {!TOKEN && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="max-w-md rounded-lg bg-zinc-800 p-4 text-sm text-zinc-200">
            Set{" "}
            <code className="text-emerald-400">NEXT_PUBLIC_MAPBOX_TOKEN</code> in{" "}
            <code>.env</code> to load the map.
          </p>
        </div>
      )}

      <section className="control-deck absolute left-3 top-3 w-[calc(100%-1.5rem)] max-w-[390px] rounded-lg p-4 text-zinc-100 sm:left-5 sm:top-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="brand-glyph brand-glyph-xs shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/80">
                Pulse live
              </p>
              <h1 className="mt-1 truncate text-2xl font-semibold tracking-normal">
                World room
              </h1>
            </div>
          </div>
          <span className="live-orb mt-1 shrink-0" aria-hidden="true" />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <div className="metric-tile">
            <p className="text-3xl font-semibold text-white">{peers.length}</p>
            <p>online</p>
          </div>
          <div className="metric-tile">
            <p className="text-3xl font-semibold text-emerald-100">P2P</p>
            <p>private</p>
          </div>
          <div className="metric-tile">
            <p className="text-3xl font-semibold text-amber-100">1-3</p>
            <p>km blur</p>
          </div>
        </div>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-cyan-200 via-emerald-200 to-amber-200 shadow-[0_0_24px_rgba(103,232,249,0.35)]" />
        </div>
      </section>

      <div className="control-deck absolute bottom-4 left-3 rounded-lg px-4 py-3 text-xs text-zinc-200 sm:left-5">
        <div className="flex items-center gap-3">
          <div className="signal-bars" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <p className="font-medium text-white">
              {canConnect ? "Ready to connect" : "Connection in progress"}
            </p>
            <p className="text-zinc-400">Presence signal active</p>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-4 right-4 hidden w-48 rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-zinc-400 backdrop-blur-md sm:block">
        <div className="mb-2 flex items-center justify-between text-zinc-200">
          <span>Signal density</span>
          <span>{Math.min(100, peers.length * 12)}%</span>
        </div>
        <div className="space-y-1.5">
          <span className="block h-1 rounded-full bg-cyan-200/80" />
          <span className="block h-1 w-3/4 rounded-full bg-emerald-200/70" />
          <span className="block h-1 w-1/2 rounded-full bg-amber-200/70" />
        </div>
      </div>
    </div>
  );
}
