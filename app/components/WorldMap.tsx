"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map as MapboxMap,
  Marker,
} from "mapbox-gl";
import type { PeerDot } from "@/lib/types";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "pk.eyJ1IjoicHVsc2UtbWFwIiwiYSI6ImNrMDBkZW1vMDAwMDAwMDAifQ.AAAAAAAAAAAAAAAAAAAAAA";
const BRIDGE_SOURCE_ID = "pulse-bridge-source";
const BRIDGE_HALO_LAYER_ID = "pulse-bridge-halo";
const BRIDGE_CORE_LAYER_ID = "pulse-bridge-core";
const BRIDGE_SPARK_LAYER_ID = "pulse-bridge-spark";
const AURORA_SOURCE_ID = "pulse-aurora-source";
const AURORA_WIDE_LAYER_ID = "pulse-aurora-wide";
const AURORA_FINE_LAYER_ID = "pulse-aurora-fine";
const PACKET_SOURCE_ID = "pulse-packet-source";
const PACKET_OUT_HALO_LAYER_ID = "pulse-packet-out-halo";
const PACKET_OUT_CORE_LAYER_ID = "pulse-packet-out-core";
const PACKET_IN_HALO_LAYER_ID = "pulse-packet-in-halo";
const PACKET_IN_CORE_LAYER_ID = "pulse-packet-in-core";
const IMPACT_SOURCE_ID = "pulse-impact-source";
const IMPACT_OUT_LAYER_ID = "pulse-impact-out";
const IMPACT_IN_LAYER_ID = "pulse-impact-in";
const IMPACT_JOIN_LAYER_ID = "pulse-impact-join";
const IMPACT_LEAVE_LAYER_ID = "pulse-impact-leave";
const IMPACT_GOODBYE_LAYER_ID = "pulse-impact-goodbye";
const PACKET_DURATION_MS = 1800;
const IMPACT_DURATION_MS = 1250;
const GOODBYE_DURATION_MS = 2600;

type SkyMode = "night" | "day" | "aurora";
type MapEffectKind = "out" | "in" | "join" | "leave" | "goodbye";

type BridgePulse = {
  id: number;
  peerId: string;
  direction: "out" | "in";
};

type Impact = {
  coordinates: [number, number];
  direction: MapEffectKind;
  startedAt: number;
  duration: number;
};

type Packet = {
  coordinates: number[][];
  destination: [number, number];
  direction: BridgePulse["direction"];
  startedAt: number;
};

type BridgeLine = {
  type: "Feature";
  geometry: {
    type: "LineString";
    coordinates: number[][];
  };
  properties: Record<string, never>;
};

type LineCollection = {
  type: "FeatureCollection";
  features: BridgeLine[];
};

type ImpactCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: {
      type: "Point";
      coordinates: [number, number];
    };
    properties: {
      direction: MapEffectKind;
      progress: number;
    };
  }>;
};

type GoodbyeBloom = {
  id: number;
  lat: number;
  lng: number;
  messages: number;
};
type PulsePassport = {
  bridges: number;
  messages: number;
  distanceKm: number;
  vanishedRooms: number;
  stamps: Array<{
    id: number;
    distanceKm: number;
    messages: number;
    endedAt: string;
  }>;
};

type PacketCollection = ImpactCollection;

function dotColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return `hsl(${Math.abs(hash) % 360}, 70%, 60%)`;
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

function shortestLngDelta(from: number, to: number) {
  let delta = to - from;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

function bridgeCoordinates(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
) {
  const points: number[][] = [];
  const deltaLng = shortestLngDelta(from.lng, to.lng);
  const km = distanceKm(from, to);
  const latDelta = to.lat - from.lat;
  const midLat = toRadians((from.lat + to.lat) / 2);
  const kmPerLngDegree = Math.max(18, 111.32 * Math.cos(midLat));
  const xKm = deltaLng * kmPerLngDegree;
  const yKm = latDelta * 110.57;
  const flatKm = Math.hypot(xKm, yKm);
  const curveRatio = km < 30 ? 0.1 : 0.18;
  const curveKm = Math.min(1800, Math.max(0.08, km * curveRatio));
  const normalX = flatKm > 0 ? -yKm / flatKm : 0;
  const normalY = flatKm > 0 ? xKm / flatKm : 1;

  for (let i = 0; i <= 72; i++) {
    const t = i / 72;
    const bowKm = Math.sin(Math.PI * t) * curveKm;
    const lng = from.lng + deltaLng * t + (normalX * bowKm) / kmPerLngDegree;
    const lat = from.lat + latDelta * t + (normalY * bowKm) / 110.57;
    points.push([lng, Math.max(-85, Math.min(85, lat))]);
  }

  return points;
}

function bridgeFeature(coordinates: number[][]): BridgeLine {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates },
    properties: {},
  };
}

function auroraFeatureCollection(coordinates: number[][]): LineCollection {
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (!isLngLatPair(first) || !isLngLatPair(last)) {
    return { type: "FeatureCollection", features: [] };
  }

  const bridgeKm = distanceKm(
    { lng: first[0], lat: first[1] },
    { lng: last[0], lat: last[1] },
  );
  const fieldWidthKm = Math.min(48, Math.max(0.16, bridgeKm * 0.035));
  const shimmerKm = Math.min(fieldWidthKm * 0.22, Math.max(0.03, bridgeKm * 0.004));
  const bandOffsets = [-0.72, 0, 0.72];

  const bands = bandOffsets.map((bandOffset, bandIndex) => {
    const bandCoordinates = coordinates.map(([lng, lat], index) => {
      const previous = coordinates[Math.max(0, index - 1)] ?? [lng, lat];
      const next =
        coordinates[Math.min(coordinates.length - 1, index + 1)] ?? [lng, lat];
      const midLat = toRadians((lat + (next[1] ?? lat)) / 2);
      const kmPerLngDegree = Math.max(18, 111.32 * Math.cos(midLat));
      const tangentX = (next[0] - previous[0]) * kmPerLngDegree;
      const tangentY = (next[1] - previous[1]) * 110.57;
      const length = Math.hypot(tangentX, tangentY) || 1;
      const normalX = -tangentY / length;
      const normalY = tangentX / length;
      const t =
        coordinates.length <= 1 ? 0 : index / Math.max(1, coordinates.length - 1);
      const taper = Math.sin(Math.PI * t);
      const ribbonKm =
        taper *
        (fieldWidthKm * bandOffset +
          Math.sin(t * Math.PI * 1.35 + bandIndex * 1.7) * shimmerKm);

      return [
        lng + (normalX * ribbonKm) / kmPerLngDegree,
        Math.max(-85, Math.min(85, lat + (normalY * ribbonKm) / 110.57)),
      ];
    });

    return {
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: bandCoordinates,
      },
      properties: {},
    };
  });

  return {
    type: "FeatureCollection",
    features: bands,
  };
}

function isLngLatPair(value: number[] | undefined): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function formatDistance(km: number) {
  if (km < 1000) return `${Math.round(km)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}

function localSolarHour(lng: number, now = new Date()) {
  const utcHour =
    now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  return (utcHour + lng / 15 + 24) % 24;
}

function skyLabel(hour: number) {
  if (hour >= 5 && hour < 8) return "dawn";
  if (hour >= 8 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 20) return "evening";
  return "night";
}

function titleCase(text: string) {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function sharedSkyLine(mySky: string, peerSky: string) {
  if (mySky === peerSky) {
    return mySky === "night" ? "Same night sky" : `Both in ${mySky} light`;
  }
  return `${titleCase(mySky)} meets ${peerSky}`;
}

function bridgeBaseGradient(): ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    ["line-progress"],
    0,
    "rgba(103,232,249,0.18)",
    0.25,
    "rgba(34,211,238,0.9)",
    0.55,
    "rgba(110,231,183,1)",
    0.8,
    "rgba(253,230,138,0.86)",
    1,
    "rgba(253,164,175,0.24)",
  ];
}

function bridgePulseGradient(progress: number): ExpressionSpecification {
  const head = Math.max(0.05, Math.min(0.95, progress));
  const tail = head - 0.04;
  const nose = head + 0.04;

  return [
    "interpolate",
    ["linear"],
    ["line-progress"],
    0,
    "rgba(103,232,249,0.16)",
    tail,
    "rgba(34,211,238,0.22)",
    head,
    "rgba(255,255,255,1)",
    nose,
    "rgba(253,230,138,0.82)",
    1,
    "rgba(253,164,175,0.2)",
  ];
}

function removeBridgeLayers(map: MapboxMap) {
  for (const id of [
    AURORA_FINE_LAYER_ID,
    AURORA_WIDE_LAYER_ID,
    BRIDGE_SPARK_LAYER_ID,
    BRIDGE_CORE_LAYER_ID,
    BRIDGE_HALO_LAYER_ID,
  ]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(AURORA_SOURCE_ID)) map.removeSource(AURORA_SOURCE_ID);
  if (map.getSource(BRIDGE_SOURCE_ID)) map.removeSource(BRIDGE_SOURCE_ID);
}

function emptyImpactCollection(): ImpactCollection {
  return {
    type: "FeatureCollection",
    features: [],
  };
}

function emptyPacketCollection(): PacketCollection {
  return {
    type: "FeatureCollection",
    features: [],
  };
}

function addPacketLayer(
  map: MapboxMap,
  id: string,
  direction: BridgePulse["direction"],
  radius: number,
  color: string,
  strokeColor: string,
  blur: number,
) {
  if (map.getLayer(id)) return;
  map.addLayer({
    id,
    type: "circle",
    source: PACKET_SOURCE_ID,
    filter: ["==", ["get", "direction"], direction],
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["get", "progress"],
        0,
        radius * 0.78,
        0.18,
        radius * 1.18,
        1,
        radius,
      ],
      "circle-color": color,
      "circle-blur": blur,
      "circle-stroke-color": strokeColor,
      "circle-stroke-width": blur > 0 ? 0 : 2,
      "circle-opacity": [
        "interpolate",
        ["linear"],
        ["get", "progress"],
        0,
        0,
        0.08,
        1,
        0.82,
        1,
        1,
        0,
      ],
      "circle-stroke-opacity": [
        "interpolate",
        ["linear"],
        ["get", "progress"],
        0,
        0,
        0.08,
        1,
        0.82,
        1,
        1,
        0,
      ],
    },
  });
}

function ensurePacketLayers(map: MapboxMap) {
  if (!map.getSource(PACKET_SOURCE_ID)) {
    map.addSource(PACKET_SOURCE_ID, {
      type: "geojson",
      data: emptyPacketCollection(),
    });
  }

  addPacketLayer(
    map,
    PACKET_OUT_HALO_LAYER_ID,
    "out",
    26,
    "rgba(103,232,249,0.36)",
    "rgba(103,232,249,0)",
    0.7,
  );
  addPacketLayer(
    map,
    PACKET_OUT_CORE_LAYER_ID,
    "out",
    7,
    "rgba(103,232,249,1)",
    "rgba(255,255,255,0.95)",
    0,
  );
  addPacketLayer(
    map,
    PACKET_IN_HALO_LAYER_ID,
    "in",
    26,
    "rgba(253,230,138,0.38)",
    "rgba(253,230,138,0)",
    0.7,
  );
  addPacketLayer(
    map,
    PACKET_IN_CORE_LAYER_ID,
    "in",
    7,
    "rgba(253,230,138,1)",
    "rgba(255,255,255,0.95)",
    0,
  );
}

function ensureImpactLayers(map: MapboxMap) {
  if (!map.getSource(IMPACT_SOURCE_ID)) {
    map.addSource(IMPACT_SOURCE_ID, {
      type: "geojson",
      data: emptyImpactCollection(),
    });
  }

  if (!map.getLayer(IMPACT_OUT_LAYER_ID)) {
    map.addLayer({
      id: IMPACT_OUT_LAYER_ID,
      type: "circle",
      source: IMPACT_SOURCE_ID,
      filter: ["==", ["get", "direction"], "out"],
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["get", "progress"],
          0,
          5,
          0.75,
          38,
          1,
          54,
        ],
        "circle-color": "rgba(103,232,249,0.08)",
        "circle-stroke-color": "rgba(103,232,249,0.92)",
        "circle-stroke-width": 2.5,
        "circle-opacity": [
          "interpolate",
          ["linear"],
          ["get", "progress"],
          0,
          0.95,
          0.75,
          0.36,
          1,
          0,
        ],
        "circle-stroke-opacity": [
          "interpolate",
          ["linear"],
          ["get", "progress"],
          0,
          1,
          0.72,
          0.42,
          1,
          0,
        ],
      },
    });
  }

  if (!map.getLayer(IMPACT_IN_LAYER_ID)) {
    map.addLayer({
      id: IMPACT_IN_LAYER_ID,
      type: "circle",
      source: IMPACT_SOURCE_ID,
      filter: ["==", ["get", "direction"], "in"],
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["get", "progress"],
          0,
          5,
          0.75,
          38,
          1,
          54,
        ],
        "circle-color": "rgba(253,230,138,0.1)",
        "circle-stroke-color": "rgba(253,230,138,0.95)",
        "circle-stroke-width": 2.5,
        "circle-opacity": [
          "interpolate",
          ["linear"],
          ["get", "progress"],
          0,
          0.95,
          0.75,
          0.36,
          1,
          0,
        ],
        "circle-stroke-opacity": [
          "interpolate",
          ["linear"],
          ["get", "progress"],
          0,
          1,
          0.72,
          0.42,
          1,
          0,
        ],
      },
    });
  }

  if (!map.getLayer(IMPACT_JOIN_LAYER_ID)) {
    map.addLayer({
      id: IMPACT_JOIN_LAYER_ID,
      type: "circle",
      source: IMPACT_SOURCE_ID,
      filter: ["==", ["get", "direction"], "join"],
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["get", "progress"],
          0,
          4,
          0.7,
          30,
          1,
          42,
        ],
        "circle-color": "rgba(110,231,183,0.1)",
        "circle-stroke-color": "rgba(110,231,183,0.9)",
        "circle-stroke-width": 2,
        "circle-opacity": [
          "interpolate",
          ["linear"],
          ["get", "progress"],
          0,
          0.9,
          1,
          0,
        ],
        "circle-stroke-opacity": [
          "interpolate",
          ["linear"],
          ["get", "progress"],
          0,
          1,
          1,
          0,
        ],
      },
    });
  }

  if (!map.getLayer(IMPACT_LEAVE_LAYER_ID)) {
    map.addLayer({
      id: IMPACT_LEAVE_LAYER_ID,
      type: "circle",
      source: IMPACT_SOURCE_ID,
      filter: ["==", ["get", "direction"], "leave"],
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["get", "progress"],
          0,
          8,
          0.65,
          38,
          1,
          52,
        ],
        "circle-color": "rgba(253,164,175,0.08)",
        "circle-stroke-color": "rgba(253,164,175,0.9)",
        "circle-stroke-width": 2.5,
        "circle-opacity": [
          "interpolate",
          ["linear"],
          ["get", "progress"],
          0,
          0.8,
          1,
          0,
        ],
        "circle-stroke-opacity": [
          "interpolate",
          ["linear"],
          ["get", "progress"],
          0,
          1,
          1,
          0,
        ],
      },
    });
  }

  if (!map.getLayer(IMPACT_GOODBYE_LAYER_ID)) {
    map.addLayer({
      id: IMPACT_GOODBYE_LAYER_ID,
      type: "circle",
      source: IMPACT_SOURCE_ID,
      filter: ["==", ["get", "direction"], "goodbye"],
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["get", "progress"],
          0,
          12,
          0.55,
          70,
          1,
          112,
        ],
        "circle-color": "rgba(253,230,138,0.1)",
        "circle-stroke-color": "rgba(253,230,138,0.95)",
        "circle-stroke-width": 3,
        "circle-opacity": [
          "interpolate",
          ["linear"],
          ["get", "progress"],
          0,
          0.95,
          0.7,
          0.32,
          1,
          0,
        ],
        "circle-stroke-opacity": [
          "interpolate",
          ["linear"],
          ["get", "progress"],
          0,
          1,
          0.72,
          0.42,
          1,
          0,
        ],
      },
    });
  }
}

export default function WorldMap({
  peers,
  me,
  bridgePeerId,
  bridgePulses,
  goodbyeBloom,
  passport,
  soundEnabled,
  onToggleSound,
  onPeerClick,
  canConnect,
}: {
  peers: PeerDot[];
  me: { lat: number; lng: number } | null;
  bridgePeerId: string | null;
  bridgePulses: BridgePulse[];
  goodbyeBloom: GoodbyeBloom | null;
  passport: PulsePassport;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onPeerClick: (id: string) => void;
  canConnect: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const meMarkerRef = useRef<Marker | null>(null);
  const seenPulseIdsRef = useRef<Set<number>>(new Set());
  const packetsRef = useRef<Map<number, Packet>>(new Map());
  const packetFrameRef = useRef<number | null>(null);
  const impactsRef = useRef<Map<number, Impact>>(new Map());
  const impactFrameRef = useRef<number | null>(null);
  const lastMomentPeerRef = useRef<string | null>(null);
  const momentTimerRef = useRef<number | null>(null);
  const effectId = useRef(10_000);
  const seenGoodbyeIdRef = useRef<number | null>(null);
  const goodbyeTimerRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [momentOpen, setMomentOpen] = useState(false);
  const [skyMode, setSkyMode] = useState<SkyMode>("night");
  const [goodbyeOpen, setGoodbyeOpen] = useState<GoodbyeBloom | null>(null);
  const [hudOpen, setHudOpen] = useState(true);

  const bridgePeer = useMemo(
    () => peers.find((peer) => peer.id === bridgePeerId) ?? null,
    [bridgePeerId, peers],
  );
  const bridge = useMemo(() => {
    if (!me || !bridgePeer) return null;
    const coordinates = bridgeCoordinates(me, bridgePeer);
    if (
      coordinates.length < 2 ||
      !isLngLatPair(coordinates[0]) ||
      !isLngLatPair(coordinates[coordinates.length - 1])
    ) {
      return null;
    }
    return {
      peer: bridgePeer,
      coordinates,
      distance: distanceKm(me, bridgePeer),
    };
  }, [bridgePeer, me]);
  const moment = useMemo(() => {
    if (!bridge || !me) return null;
    const mySky = skyLabel(localSolarHour(me.lng));
    const peerSky = skyLabel(localSolarHour(bridge.peer.lng));

    return {
      distance: formatDistance(bridge.distance),
      mySky,
      peerSky,
      line: sharedSkyLine(mySky, peerSky),
    };
  }, [bridge, me]);

  // Marker click handlers are bound once, so read the live click handler +
  // connectability through refs (synced in an effect, never during render).
  const onPeerClickRef = useRef(onPeerClick);
  const canConnectRef = useRef(canConnect);
  useEffect(() => {
    onPeerClickRef.current = onPeerClick;
    canConnectRef.current = canConnect;
  });

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    if (skyMode === "day") {
      map.setFog({
        color: "rgba(186, 230, 253, 0.72)",
        "high-color": "rgba(253, 230, 138, 0.28)",
        "horizon-blend": 0.18,
        "space-color": "rgba(12, 23, 38, 1)",
        "star-intensity": 0.08,
      });
    } else if (skyMode === "aurora") {
      map.setFog({
        color: "rgba(8, 13, 24, 0.92)",
        "high-color": "rgba(110, 231, 183, 0.35)",
        "horizon-blend": 0.18,
        "space-color": "rgba(2, 6, 23, 1)",
        "star-intensity": 0.56,
      });
    } else {
      map.setFog({
        color: "rgba(9, 13, 22, 0.95)",
        "high-color": "rgba(39, 213, 191, 0.2)",
        "horizon-blend": 0.12,
        "space-color": "rgba(2, 6, 23, 1)",
        "star-intensity": 0.35,
      });
    }

    if (map.getLayer(AURORA_WIDE_LAYER_ID)) {
      map.setPaintProperty(
        AURORA_WIDE_LAYER_ID,
        "line-opacity",
        skyMode === "aurora" ? 0.26 : 0,
      );
    }
    if (map.getLayer(AURORA_FINE_LAYER_ID)) {
      map.setPaintProperty(
        AURORA_FINE_LAYER_ID,
        "line-opacity",
        skyMode === "aurora" ? 0.68 : 0,
      );
    }
  }, [ready, skyMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !bridge || !bridgePeerId) {
      lastMomentPeerRef.current = null;
      if (momentTimerRef.current) {
        window.clearTimeout(momentTimerRef.current);
        momentTimerRef.current = null;
      }
      setMomentOpen(false);
      return;
    }
    if (lastMomentPeerRef.current === bridgePeerId) return;

    lastMomentPeerRef.current = bridgePeerId;
    setMomentOpen(true);
    if (momentTimerRef.current) window.clearTimeout(momentTimerRef.current);
    momentTimerRef.current = window.setTimeout(() => {
      setMomentOpen(false);
      momentTimerRef.current = null;
    }, 9000);

    const first = bridge.coordinates[0];
    const last = bridge.coordinates[bridge.coordinates.length - 1];
    if (!isLngLatPair(first) || !isLngLatPair(last)) return;

    const desktop = window.innerWidth >= 900;
    const horizontalPad = Math.max(48, Math.min(360, window.innerWidth * 0.18));
    try {
      map.fitBounds([first, last], {
        padding: desktop
          ? {
              top: 150,
              bottom: 160,
              left: horizontalPad,
              right: horizontalPad,
            }
          : { top: 170, bottom: 360, left: 48, right: 48 },
        duration: 1400,
        maxZoom: 6.2,
        pitch: 42,
      });
    } catch {}

  }, [bridge, bridgePeerId, ready]);

  useEffect(() => {
    return () => {
      if (momentTimerRef.current) window.clearTimeout(momentTimerRef.current);
      if (goodbyeTimerRef.current) window.clearTimeout(goodbyeTimerRef.current);
    };
  }, []);

  const renderImpacts = useCallback(function tickImpact(
    map: MapboxMap,
    now: number,
  ) {
    const source = map.getSource(IMPACT_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) {
      impactFrameRef.current = null;
      return;
    }

    const features: ImpactCollection["features"] = [];
    for (const [id, impact] of impactsRef.current) {
      const progress = Math.min(1, (now - impact.startedAt) / impact.duration);
      if (progress >= 1) {
        impactsRef.current.delete(id);
        continue;
      }

      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: impact.coordinates,
        },
        properties: {
          direction: impact.direction,
          progress,
        },
      });
    }

    source.setData({
      type: "FeatureCollection",
      features,
    });

    if (impactsRef.current.size > 0 && mapRef.current === map) {
      impactFrameRef.current = requestAnimationFrame((next) => {
        tickImpact(map, next);
      });
    } else {
      impactFrameRef.current = null;
    }
  }, []);

  const startImpact = useCallback((
    map: MapboxMap,
    id: number,
    coordinates: [number, number],
    direction: MapEffectKind,
    duration = IMPACT_DURATION_MS,
  ) => {
    ensureImpactLayers(map);
    impactsRef.current.set(id, {
      coordinates,
      direction,
      startedAt: performance.now(),
      duration,
    });

    if (impactFrameRef.current === null) {
      impactFrameRef.current = requestAnimationFrame((now) => {
        renderImpacts(map, now);
      });
    }
  }, [renderImpacts]);

  const renderPackets = useCallback(function tickPacket(
    map: MapboxMap,
    now: number,
  ) {
    const source = map.getSource(PACKET_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) {
      packetFrameRef.current = null;
      return;
    }

    const features: PacketCollection["features"] = [];
    let latestLineProgress: number | null = null;

    for (const [id, packet] of packetsRef.current) {
      const progress = Math.min(1, (now - packet.startedAt) / PACKET_DURATION_MS);
      if (progress >= 1) {
        packetsRef.current.delete(id);
        startImpact(map, id, packet.destination, packet.direction);
        continue;
      }

      const eased = 1 - (1 - progress) ** 3;
      latestLineProgress =
        packet.direction === "out" ? eased : Math.max(0, 1 - eased);
      const index = Math.min(
        packet.coordinates.length - 1,
        Math.round(eased * (packet.coordinates.length - 1)),
      );
      const coordinate = packet.coordinates[index];
      if (!isLngLatPair(coordinate)) {
        packetsRef.current.delete(id);
        continue;
      }

      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: coordinate,
        },
        properties: {
          direction: packet.direction,
          progress,
        },
      });
    }

    source.setData({
      type: "FeatureCollection",
      features,
    });

    if (latestLineProgress !== null && map.getLayer(BRIDGE_CORE_LAYER_ID)) {
      map.setPaintProperty(
        BRIDGE_CORE_LAYER_ID,
        "line-gradient",
        bridgePulseGradient(latestLineProgress),
      );
      map.setPaintProperty(BRIDGE_CORE_LAYER_ID, "line-width", 5.5);
    }

    if (packetsRef.current.size > 0 && mapRef.current === map) {
      packetFrameRef.current = requestAnimationFrame((next) => {
        tickPacket(map, next);
      });
    } else {
      if (map.getLayer(BRIDGE_CORE_LAYER_ID)) {
        map.setPaintProperty(
          BRIDGE_CORE_LAYER_ID,
          "line-gradient",
          bridgeBaseGradient(),
        );
        map.setPaintProperty(BRIDGE_CORE_LAYER_ID, "line-width", 3);
      }
      packetFrameRef.current = null;
    }
  }, [startImpact]);

  const startPacket = useCallback((
    map: MapboxMap,
    id: number,
    coordinates: number[][],
    destination: [number, number],
    direction: BridgePulse["direction"],
  ) => {
    if (coordinates.length < 2 || !isLngLatPair(destination)) return;
    ensurePacketLayers(map);
    packetsRef.current.set(id, {
      coordinates,
      destination,
      direction,
      startedAt: performance.now(),
    });

    if (packetFrameRef.current === null) {
      packetFrameRef.current = requestAnimationFrame((now) => {
        renderPackets(map, now);
      });
    }
  }, [renderPackets]);

  // Initialise the map once.
  useEffect(() => {
    if (!TOKEN || !containerRef.current) return;
    let cancelled = false;
    const markers = markersRef.current;
    const packets = packetsRef.current;
    const impacts = impactsRef.current;

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
      if (impactFrameRef.current !== null) {
        cancelAnimationFrame(impactFrameRef.current);
        impactFrameRef.current = null;
      }
      if (packetFrameRef.current !== null) {
        cancelAnimationFrame(packetFrameRef.current);
        packetFrameRef.current = null;
      }
      packets.clear();
      impacts.clear();
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
          if (isLngLatPair([peer.lng, peer.lat])) {
            startImpact(
              map,
              effectId.current++,
              [peer.lng, peer.lat],
              "join",
              1400,
            );
          }
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
        element.setAttribute("aria-label", peer.busy ? "Person is busy" : "Tap to connect");
      }

      // Drop markers for peers that went offline / got filtered out.
      for (const [id, marker] of markers) {
        if (!seen.has(id)) {
          const lngLat = marker.getLngLat();
          startImpact(
            map,
            effectId.current++,
            [lngLat.lng, lngLat.lat],
            "leave",
            1600,
          );
          marker.remove();
          markers.delete(id);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [peers, ready, startImpact]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !goodbyeBloom) return;
    if (seenGoodbyeIdRef.current === goodbyeBloom.id) return;
    seenGoodbyeIdRef.current = goodbyeBloom.id;

    startImpact(
      map,
      effectId.current++,
      [goodbyeBloom.lng, goodbyeBloom.lat],
      "goodbye",
      GOODBYE_DURATION_MS,
    );
    setGoodbyeOpen(goodbyeBloom);
    if (goodbyeTimerRef.current) window.clearTimeout(goodbyeTimerRef.current);
    goodbyeTimerRef.current = window.setTimeout(() => {
      setGoodbyeOpen(null);
      goodbyeTimerRef.current = null;
    }, 5200);
  }, [goodbyeBloom, ready, startImpact]);

  // Draw the live bridge between approximate locations while a connection is open.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    if (!bridge) {
      removeBridgeLayers(map);
      return;
    }

    const data = bridgeFeature(bridge.coordinates);
    const auroraData = auroraFeatureCollection(bridge.coordinates);
    const source = map.getSource(BRIDGE_SOURCE_ID) as GeoJSONSource | undefined;

    if (source) {
      source.setData(data);
      const auroraSource = map.getSource(AURORA_SOURCE_ID) as
        | GeoJSONSource
        | undefined;
      auroraSource?.setData(auroraData);
      return;
    }

    map.addSource(AURORA_SOURCE_ID, {
      type: "geojson",
      data: auroraData,
      lineMetrics: true,
    });

    map.addLayer({
      id: AURORA_WIDE_LAYER_ID,
      type: "line",
      source: AURORA_SOURCE_ID,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#6ee7b7",
        "line-opacity": skyMode === "aurora" ? 0.26 : 0,
        "line-width": 28,
        "line-blur": 24,
      },
    });

    map.addLayer({
      id: AURORA_FINE_LAYER_ID,
      type: "line",
      source: AURORA_SOURCE_ID,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-gradient": [
          "interpolate",
          ["linear"],
          ["line-progress"],
          0,
          "rgba(103,232,249,0)",
          0.32,
          "rgba(103,232,249,0.55)",
          0.62,
          "rgba(110,231,183,0.42)",
          1,
          "rgba(253,230,138,0)",
        ],
        "line-opacity": skyMode === "aurora" ? 0.68 : 0,
        "line-width": 4,
        "line-blur": 2,
      },
    });

    map.addSource(BRIDGE_SOURCE_ID, {
      type: "geojson",
      data,
      lineMetrics: true,
    });

    map.addLayer({
      id: BRIDGE_HALO_LAYER_ID,
      type: "line",
      source: BRIDGE_SOURCE_ID,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#22d3ee",
        "line-opacity": 0.22,
        "line-width": 16,
        "line-blur": 14,
      },
    });

    map.addLayer({
      id: BRIDGE_CORE_LAYER_ID,
      type: "line",
      source: BRIDGE_SOURCE_ID,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-gradient": bridgeBaseGradient(),
        "line-opacity": 0.9,
        "line-width": 3,
      },
    });

    map.addLayer({
      id: BRIDGE_SPARK_LAYER_ID,
      type: "line",
      source: BRIDGE_SOURCE_ID,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#ffffff",
        "line-dasharray": [0.1, 2.4],
        "line-opacity": 0.52,
        "line-width": 2,
      },
    });
  }, [bridge, ready, skyMode]);

  // Animate one small "message packet" along the bridge for each chat message.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !bridge) return;

    const pending = bridgePulses.filter(
      (pulse) =>
        pulse.peerId === bridge.peer.id && !seenPulseIdsRef.current.has(pulse.id),
    );
    if (pending.length === 0) return;

    for (const pulse of pending) {
      seenPulseIdsRef.current.add(pulse.id);
      const coordinates =
        pulse.direction === "out"
          ? bridge.coordinates
          : [...bridge.coordinates].reverse();
      const destination = coordinates[coordinates.length - 1] as [number, number];
      startPacket(map, pulse.id, coordinates, destination, pulse.direction);
    }
  }, [bridge, bridgePulses, ready, startPacket]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full bg-zinc-900" />
      <div
        className={`sky-wash sky-wash-${skyMode} pointer-events-none absolute inset-0`}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,transparent_0%,rgba(2,6,23,0.08)_45%,rgba(2,6,23,0.7)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-zinc-950/80 to-transparent" />

      {momentOpen && moment && (
        <section className="pulse-moment control-deck pointer-events-none absolute left-1/2 top-5 z-20 w-[min(380px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg p-4 text-zinc-100">
          <div className="flex items-start gap-3">
            <span className="moment-seal shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/80">
                Pulse moment
              </p>
              <h2 className="mt-1 text-xl font-semibold leading-tight tracking-normal">
                {moment.line}
              </h2>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                <div className="moment-stat">
                  <p>{moment.distance}</p>
                  <span>apart</span>
                </div>
                <div className="moment-stat">
                  <p>{moment.mySky}</p>
                  <span>you</span>
                </div>
                <div className="moment-stat">
                  <p>{moment.peerSky}</p>
                  <span>them</span>
                </div>
              </div>
              <p className="mt-3 text-xs text-zinc-400">Signal formed just now.</p>
            </div>
          </div>
        </section>
      )}

      {goodbyeOpen && (
        <section className="goodbye-bloom-card control-deck pointer-events-none absolute bottom-24 left-3 z-20 w-[min(320px,calc(100vw-1.5rem))] rounded-lg p-4 text-zinc-100 sm:left-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-200/80">
            Room vanished
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-normal">
            Nothing followed you out.
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            {goodbyeOpen.messages}{" "}
            {goodbyeOpen.messages === 1 ? "message" : "messages"} dissolved with
            the bridge.
          </p>
        </section>
      )}

      {!TOKEN && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="max-w-md rounded-lg bg-zinc-800 p-4 text-sm text-zinc-200">
            Set{" "}
            <code className="text-emerald-400">NEXT_PUBLIC_MAPBOX_TOKEN</code> in{" "}
            <code>.env</code> to load the map.
          </p>
        </div>
      )}

      <div className="absolute left-3 top-3 z-20 flex gap-2 sm:left-5 sm:top-5">
        <button
          type="button"
          onClick={() => setHudOpen((open) => !open)}
          className="control-deck rounded-full px-3 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-white/10 active:scale-95"
        >
          {hudOpen ? "Hide HUD" : "Show HUD"}
        </button>
        <button
          type="button"
          onClick={onToggleSound}
          className={`control-deck rounded-full px-3 py-2 text-xs font-semibold transition active:scale-95 ${
            soundEnabled ? "text-amber-100" : "text-zinc-400"
          }`}
        >
          Sound {soundEnabled ? "on" : "off"}
        </button>
      </div>

      {hudOpen && (
      <section className="control-deck absolute left-3 top-16 w-[calc(100%-1.5rem)] max-w-[410px] rounded-lg p-4 text-zinc-100 sm:left-5 sm:top-16">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="brand-glyph brand-glyph-xs shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/80">
                Pulse
              </p>
              <h1 className="mt-1 truncate text-2xl font-semibold tracking-normal">
                World map
              </h1>
            </div>
          </div>
          <span className="live-orb mt-1 shrink-0" aria-hidden="true" />
        </div>

        <div className="mt-5 grid grid-cols-[0.9fr_1.1fr] gap-3">
          <div className="metric-tile flex items-end gap-2 p-3">
            <p className="text-4xl font-semibold leading-none text-white">
              {peers.length}
            </p>
            <p className="pb-1 text-xs leading-tight text-zinc-400">
              people
              <br />
              online
            </p>
          </div>

          <div className="space-y-2">
            <div className="metric-tile p-3">
              <p className="font-semibold text-emerald-100">Private chat</p>
              <p className="mt-0.5 text-xs text-zinc-500">Gone when you leave.</p>
            </div>
            <div className="metric-tile p-3">
              <p className="font-semibold text-amber-100">Approximate location</p>
              <p className="mt-0.5 text-xs text-zinc-500">Nearby, never exact.</p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-cyan-200 via-emerald-200 to-amber-200 shadow-[0_0_24px_rgba(103,232,249,0.35)]" />
          </div>
          <span className="text-xs text-zinc-500">live now</span>
        </div>

        <div className="mt-4 flex rounded-full border border-white/10 bg-black/20 p-1 text-xs">
          {(["night", "day", "aurora"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSkyMode(mode)}
              className={`flex-1 rounded-full px-3 py-1.5 font-medium capitalize transition ${
                skyMode === mode
                  ? "bg-white text-zinc-950"
                  : "text-zinc-400 hover:text-zinc-100"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </section>
      )}

      <section className="passport-card control-deck absolute right-3 top-3 hidden w-72 rounded-lg p-4 text-zinc-100 lg:block">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-200/80">
              Pulse passport
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-normal">
              Session stamps
            </h2>
          </div>
          <span className="passport-seal" aria-hidden="true" />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
          <div className="moment-stat">
            <p>{passport.bridges}</p>
            <span>bridges</span>
          </div>
          <div className="moment-stat">
            <p>{passport.messages}</p>
            <span>msgs</span>
          </div>
          <div className="moment-stat">
            <p>{Math.round(passport.distanceKm).toLocaleString()}</p>
            <span>km</span>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {passport.stamps.length === 0 ? (
            <p className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs leading-relaxed text-zinc-500">
              End a room to stamp this temporary passport.
            </p>
          ) : (
            passport.stamps.map((stamp) => (
              <div
                key={stamp.id}
                className="rounded-md border border-amber-200/10 bg-amber-200/[0.06] px-3 py-2 text-xs"
              >
                <p className="font-semibold text-amber-100">
                  {Math.round(stamp.distanceKm).toLocaleString()} km crossed
                </p>
                <p className="mt-1 text-zinc-500">
                  {stamp.messages} {stamp.messages === 1 ? "message" : "messages"} vanished at {stamp.endedAt}
                </p>
              </div>
            ))
          )}
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
              {bridge
                ? "Pulse Bridge is live"
                : canConnect
                  ? "Tap a dot to say hello"
                  : "Connecting..."}
            </p>
            <p className="text-zinc-400">
              {bridge
                ? `${formatDistance(bridge.distance)} apart. Messages land as ripples.`
                : "The map updates as people come and go"}
            </p>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-4 right-4 hidden w-48 rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-zinc-400 backdrop-blur-md sm:block">
        <div className="mb-2 flex items-center justify-between text-zinc-200">
          <span>Room activity</span>
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
