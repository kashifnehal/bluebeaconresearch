"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { SEVERITY_CONFIG, COMMODITIES } from "@blue-beacon-research/shared";
import type { Signal, CommodityImpact } from "@blue-beacon-research/shared";
import { safeFormatDistanceToNow, SELECT_CLASSES } from "@/lib/utils";
import "maplibre-gl/dist/maplibre-gl.css";

import { IngestionStatusBanner } from "@/components/IngestionStatusBanner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BASEMAP_TILE_URL,
  BASEMAP_TILE_URLS,
  BASEMAP_ATTRIBUTION,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
} from "@/lib/map-config";
import { useSignalFeed } from "@/hooks/useSignalFeed";
import { getSignalCoordinates } from "@/lib/geo-coords";

// Severity badge convention shared with components/signals/SeverityBadge.tsx (score
// >=7 uses the SEVERITY_CONFIG label/color tiers; below that there's no defined tier,
// so this falls back to a muted "Low" badge using the same neutral palette the rest
// of the map page already uses for de-emphasized text/panels).
function getSeverityVisual(score: number): { label: string; color: string; bgColor: string } {
  if (score >= 10) return SEVERITY_CONFIG[10];
  if (score >= 9) return SEVERITY_CONFIG[9];
  if (score >= 8) return SEVERITY_CONFIG[8];
  if (score >= 7) return SEVERITY_CONFIG[7];
  return { label: "Low", color: "#86948a", bgColor: "#201f1f" };
}

type PopupSignal = {
  id: string;
  title: string;
  severity: number;
  commodityImpacts?: CommodityImpact[] | null;
};

// Shared by both popup call sites (feed-select flyto and unclustered-point click) —
// previously each built its own near-identical HTML string inline. Kept as a plain
// HTML-string builder (not a React component) since a MapLibre Popup hosts raw HTML
// via setHTML(), not a React tree. Minimal by design: headline + severity + at most
// one commodity-impact line + the drill-down link — this is an entry point into the
// full analysis, not the analysis itself.
function buildSignalPopupHTML(signal: PopupSignal): string {
  const visual = getSeverityVisual(signal.severity);
  const topImpact = [...(signal.commodityImpacts ?? [])].sort(
    (a, b) => (b.confidence ?? 0) - (a.confidence ?? 0),
  )[0];
  const impactAsset = topImpact
    ? COMMODITIES.find((c) => c.symbol === topImpact.asset)?.label ?? topImpact.asset
    : null;
  const impactDirection = topImpact
    ? topImpact.direction.charAt(0).toUpperCase() + topImpact.direction.slice(1)
    : null;

  return `<div style="font-family: Inter, sans-serif; color: #e5e2e1; width: 240px;">
    <div style="font-size: 13px; font-weight: 700; line-height: 1.3; margin-bottom: 8px;">${signal.title}</div>
    <span style="display:inline-block; font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; padding: 2px 8px; border-radius: 3px; background:${visual.bgColor}; color:${visual.color};">${signal.severity} · ${visual.label.toUpperCase()}</span>
    ${
      impactAsset
        ? `<div style="margin-top:8px; font-size: 11px; color:#bbcac0;"><span style="color:#4edea3; font-weight:700;">${impactAsset}:</span> ${impactDirection}</div>`
        : ""
    }
    <div style="margin-top:10px; padding-top: 8px; border-top: 1px solid #2a2a2a; text-align:right;"><a href="/events/${signal.id}" style="color:#4edea3;font-weight:700;font-size:10px;letter-spacing:0.05em;text-decoration:none;">VIEW EVENT →</a></div>
  </div>`;
}

export default function MapPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const {
    liveSignals,
    isLoading,
    isError,
    fallback,
    fallbackReason,
    fallbackLastUpdated,
  } = useSignalFeed();
  const signals = liveSignals ?? [];
  // Server-side filtered results (severity/region/window) — proper React state, not a ref,
  // so it reliably triggers recomputation. Previously this was a ref that the map source was
  // poked with directly, out of band from React state, which raced with the SSE-driven
  // `geolocatedSignals` recompute and meant filter changes often didn't stick on the map.
  const [serverFilteredSignals, setServerFilteredSignals] = useState<Signal[]>([]);
  const [timeWindow, setTimeWindow] = useState<"24h" | "7d" | "all">("all");
  const [minSeverity, setMinSeverity] = useState<number>(1);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

  // Server-side filtering only narrows by severity/region/window (the params /api/signals
  // actually supports). Merge those results with the live feed so the pool always includes
  // anything newer than the last server fetch, then apply the full filter set (including
  // category, which has no server param and is always client-side) below.
  const filterPool = useMemo(() => {
    const map = new Map<string, Signal>();
    for (const s of serverFilteredSignals) map.set(s.id, s);
    for (const s of signals) if (!map.has(s.id)) map.set(s.id, s);
    return Array.from(map.values());
  }, [serverFilteredSignals, signals]);

  const geolocatedSignals = useMemo(() => {
    return filterPool
      .map((s) => {
        const [lng, lat] = getSignalCoordinates(s);
        return { ...s, lat, lng };
      })
      .filter(
        (signal) =>
          signal.severity >= minSeverity &&
          (selectedCategory ? signal.eventType === selectedCategory : true) &&
          (selectedRegion ? signal.region === selectedRegion : true) &&
          (timeWindow === "all"
            ? true
            : timeWindow === "24h"
              ? new Date(signal.eventDate ?? signal.createdAt) >=
                new Date(Date.now() - 24 * 60 * 60 * 1000)
              : timeWindow === "7d"
                ? new Date(signal.eventDate ?? signal.createdAt) >=
                  new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                : true),
      );
  }, [filterPool, minSeverity, selectedCategory, selectedRegion, timeWindow]);
  const geolocatedSignalsRef = useRef<Signal[]>([]);
  geolocatedSignalsRef.current = geolocatedSignals;
  // Stream list now shares the exact same filtered set as the map markers —
  // previously it always showed the unfiltered feed regardless of active filters.
  const liveItems = geolocatedSignals.slice(0, 6);

  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [tensionInfoOpen, setTensionInfoOpen] = useState(false);
  const [streamCollapsed, setStreamCollapsed] = useState(false);
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);

  const [mapError, setMapError] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapLibRef = useRef<any>(null);

  const signalsGeoJsonRef = useRef<any | null>(null);
  const popupRef = useRef<any | null>(null);

  // Helper: convert signals to GeoJSON FeatureCollection, excluding invalid coordinates
  function signalsToGeoJSON(items: Signal[]) {
    const features = items.map((s) => {
      const [lng, lat] = getSignalCoordinates(s);
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [lng, lat] },
        properties: {
          id: s.id,
          title: s.title,
          severity: s.severity,
          country: s.country,
          region: s.region,
          eventType: s.eventType,
          eventDate: s.eventDate ?? s.createdAt,
          summary: s.summary,
          // GeoJSON sources stringify non-primitive property values internally anyway
          // (MapLibre can't carry arrays/objects through its vector-tile encoding) —
          // stringifying explicitly here makes that behavior visible and intentional
          // rather than relying on it implicitly.
          commodityImpacts: JSON.stringify(s.commodityImpacts ?? []),
        },
      };
    });

    return { type: "FeatureCollection", features };
  }

  function handleFeedSelect(signal: Signal) {
    setSelectedSignalId(signal.id);
    const map = mapRef.current;
    const maplib = mapLibRef.current;
    if (!map || !maplib) {
      router.push(`/events/${signal.id}`);
      return;
    }

    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }

    const [lng, lat] = getSignalCoordinates(signal);
    map.easeTo({
      center: [lng, lat],
      zoom: Math.max(map.getZoom(), 5),
    });

    const html = buildSignalPopupHTML(signal);

    const popup = new maplib.Popup({ offset: 12, closeButton: false })
      .setLngLat([lng, lat])
      .setHTML(html)
      .addTo(map);
    popupRef.current = popup;
  }

  useEffect(() => {
    let canceled = false;

    async function initMap() {
      if (!mapContainerRef.current) return;

      try {
        const module = await import("maplibre-gl");
        const maplib = module;

        // Root-cause fix (found via live browser verification, not visible from code review):
        // under Next.js/Turbopack's bundling of a dynamic `import("maplibre-gl")`, MapLibre's
        // internal worker URL resolves to an empty string, so the Worker construction fails
        // immediately (silently — no console error). Every GeoJSON source (heatmap, clusters,
        // unclustered points) depends on that worker for parsing, so signals never rendered as
        // markers even though the source/layers were added without error. Pointing at the
        // prebuilt worker bundle explicitly fixes it. Must run before any `new maplib.Map(...)`.
        maplib.setWorkerUrl(
          "https://unpkg.com/maplibre-gl@6.3.0/dist/maplibre-gl-worker.mjs",
        );

        // H1 fix: inject MapLibre CSS matching package.json version 6.3.0
        if (!document.querySelector('link[data-maplibre-css]')) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/maplibre-gl@6.3.0/dist/maplibre-gl.css';
          link.setAttribute('data-maplibre-css', '1');
          document.head.appendChild(link);
        }

        if (canceled || !mapContainerRef.current) return;

        mapLibRef.current = maplib;
        // Create a raster tile style for CartoDB Dark Matter tiles with proper attribution
        const map = new maplib.Map({
          container: mapContainerRef.current,
          style: {
            version: 8,
            sources: {
              osm: {
                type: "raster",
                tiles: BASEMAP_TILE_URLS,
                tileSize: 256,
                attribution: BASEMAP_ATTRIBUTION,
              },
            },
            layers: [
              {
                id: "osm-tiles",
                type: "raster",
                source: "osm",
                minzoom: 0,
                maxzoom: 19,
              },
            ],
          },
          center: DEFAULT_MAP_CENTER,
          zoom: DEFAULT_MAP_ZOOM,
        });

        mapRef.current = map;
        setMapError(null);

        // Ensure map resizes properly on container mount & window resize
        const handleResize = () => map.resize();
        window.addEventListener("resize", handleResize);
        setTimeout(handleResize, 100);
        setTimeout(handleResize, 500);

        try {
          // Add compact attribution control (OpenStreetMap credit)
          map.addControl(new maplib.AttributionControl({ compact: true }));
        } catch (err) {
          // Non-fatal: continue without attribution control if it fails
          console.warn("[map] addControl failed", err);
        }

        map.on("load", () => {
          try {
            const initialGeoJson = signalsGeoJsonRef.current || signalsToGeoJSON(geolocatedSignalsRef.current);
            // Add GeoJSON source for signals with clustering enabled
            if (!map.getSource("signals")) {
              map.addSource("signals", {
                type: "geojson",
                data: initialGeoJson,
                cluster: true,
                clusterRadius: 50,
                clusterMaxZoom: 14,
              });
            } else {
              (map.getSource("signals") as any)?.setData(initialGeoJson);
            }

            // Heatmap layer (density of events) - weight = 1 per event
            if (!map.getLayer("signals-heatmap")) {
              map.addLayer({
                id: "signals-heatmap",
                type: "heatmap",
                source: "signals",
                maxzoom: 9,
                paint: {
                  // intensity of heatmap
                  "heatmap-weight": [
                    "interpolate",
                    ["linear"],
                    ["get", "severity"],
                    1,
                    1,
                  ],
                  "heatmap-intensity": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    0,
                    1,
                    9,
                    3,
                  ],
                  "heatmap-radius": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    0,
                    20,
                    9,
                    60,
                  ],
                  "heatmap-opacity": 0.6,
                },
              } as any);
            }

            // Cluster circles
            if (!map.getLayer("clusters")) {
              map.addLayer({
                id: "clusters",
                type: "circle",
                source: "signals",
                filter: ["has", "point_count"],
                paint: {
                  "circle-color": [
                    "step",
                    ["get", "point_count"],
                    "#4edea3",
                    10,
                    "#f1c40f",
                    50,
                    "#ee7d77",
                  ],
                  "circle-radius": [
                    "step",
                    ["get", "point_count"],
                    15,
                    10,
                    20,
                    50,
                    28,
                  ],
                  "circle-stroke-width": 1,
                  "circle-stroke-color": "#000000",
                },
              } as any);

              // Cluster count labels
              map.addLayer({
                id: "cluster-count",
                type: "symbol",
                source: "signals",
                filter: ["has", "point_count"],
                layout: {
                  "text-field": "{point_count_abbreviated}",
                  "text-size": 12,
                },
                paint: {
                  "text-color": "#000",
                },
              } as any);
            }

            // Unclustered points
            if (!map.getLayer("unclustered-point")) {
              map.addLayer({
                id: "unclustered-point",
                type: "circle",
                source: "signals",
                filter: ["!", ["has", "point_count"]],
                paint: {
                  // radius based on severity
                  "circle-radius": [
                    "interpolate",
                    ["linear"],
                    ["get", "severity"],
                    1,
                    6,
                    10,
                    14,
                  ],
                  "circle-color": [
                    "interpolate",
                    ["linear"],
                    ["get", "severity"],
                    1,
                    "#2d9f6a",
                    5,
                    "#ffd166",
                    8,
                    "#ee7d77",
                  ],
                  "circle-stroke-color": "#111",
                  "circle-stroke-width": 1,
                },
              } as any);
            }

            // Click handlers: clusters -> zoom, points -> popup
            map.on("click", "clusters", (e: any) => {
              const features = map.queryRenderedFeatures(e.point, {
                layers: ["clusters"],
              });
              const cluster = features[0];
              const clusterId = cluster.properties.cluster_id;
              const source: any = map.getSource("signals");
              if (
                source &&
                typeof source.getClusterExpansionZoom === "function"
              ) {
                source.getClusterExpansionZoom(
                  clusterId,
                  (err: any, zoom: number) => {
                    if (err) return;
                    const coords = (cluster.geometry as any).coordinates;
                    map.easeTo({ center: coords, zoom });
                  },
                );
              } else {
                // Fallback: zoom in a couple of levels
                const coords = (cluster.geometry as any).coordinates;
                map.easeTo({ center: coords, zoom: map.getZoom() + 2 });
              }
            });

            map.on("click", "unclustered-point", (e: any) => {
              const feat = e.features && e.features[0];
              if (!feat) return;
              const props = feat.properties || {};
              const sev = Number(props.severity) || 0;
              const title = props.title ?? "";
              let commodityImpacts: CommodityImpact[] = [];
              try {
                commodityImpacts = JSON.parse(props.commodityImpacts || "[]");
              } catch {
                commodityImpacts = [];
              }
              const html = buildSignalPopupHTML({
                id: props.id,
                title,
                severity: sev,
                commodityImpacts,
              });

              // Remove existing popup
              if (popupRef.current) {
                popupRef.current.remove();
                popupRef.current = null;
              }

              const popup = new maplib.Popup({ offset: 12, closeButton: false })
                .setLngLat(feat.geometry.coordinates)
                .setHTML(html)
                .addTo(map);
              popupRef.current = popup;
            });

            // Change cursor on hover
            map.on(
              "mouseenter",
              "clusters",
              () => (map.getCanvas().style.cursor = "pointer"),
            );
            map.on(
              "mouseleave",
              "clusters",
              () => (map.getCanvas().style.cursor = "default"),
            );
            map.on(
              "mouseenter",
              "unclustered-point",
              () => (map.getCanvas().style.cursor = "pointer"),
            );
            map.on(
              "mouseleave",
              "unclustered-point",
              () => (map.getCanvas().style.cursor = "default"),
            );
          } catch (err) {
            console.warn("[map] layer setup error", err);
          }
        });
      } catch (error) {
        console.error("[map] init failed", error);
        setMapError("Failed to initialize map.");
      }
    }

    void initMap();

    return () => {
      canceled = true;
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
      mapRef.current?.remove();
      mapRef.current = null;
      mapLibRef.current = null;
    };
  }, []);

  // Fetch server-side filtered signals when filters change so filters affect actual dataset.
  // Only sets React state here — Effect below (keyed on `geolocatedSignals`) is the single
  // writer to the map source, so there's no race between this fetch and the live feed.
  useEffect(() => {
    let cancelled = false;
    async function fetchFiltered() {
      try {
        const params = new URLSearchParams();
        params.set("sort", "severity");
        if (minSeverity && minSeverity > 1)
          params.set("severity", String(minSeverity));
        if (selectedRegion) params.set("region", selectedRegion);
        if (timeWindow === "24h") params.set("window", "24h");
        if (timeWindow === "7d") params.set("window", "7d");

        const res = await fetch(`/api/signals?${params.toString()}`);
        if (!res.ok) return;
        const json = (await res.json()) as { signals: Signal[] };
        if (cancelled) return;
        setServerFilteredSignals(json.signals ?? []);
      } catch (err) {
        // ignore
      }
    }

    void fetchFiltered();
    return () => {
      cancelled = true;
    };
  }, [timeWindow, minSeverity, selectedCategory, selectedRegion]);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Update GeoJSON source data for signals while preserving camera position
    const fc = signalsToGeoJSON(geolocatedSignals);
    signalsGeoJsonRef.current = fc;
    const src = map.getSource("signals") as any;
    if (src) {
      try {
        src.setData(fc);
      } catch (err) {
        // Some older maplibre builds may require a small timeout
        setTimeout(() => src.setData(fc), 50);
      }
    }
  }, [geolocatedSignals, router]);

  // Compute Global Tension Index components from liveSignals
  const tensionMetrics = useMemo(() => {
    let cyber = 0;
    let kinetic = 0;
    let diplomatic = 0;

    for (const s of liveSignals) {
      const t = (s.eventType || "").toLowerCase();
      const title = (s.title || "").toLowerCase();

      if (/cyber|hack|drone|tech|ai|digital|network|telecom|satellite/i.test(t + " " + title)) {
        cyber += 1;
      } else if (/military|navy|troops|strike|attack|missile|war|ship|tanker|border|conflict|weapon|defense/i.test(t + " " + title)) {
        kinetic += 1;
      } else if (/sanction|diplom|bank|trade|market|tariff|opec|bond|fund|asset|deal|negotiation|talks|economy/i.test(t + " " + title)) {
        diplomatic += 1;
      } else {
        kinetic += 1;
      }
    }

    const total = Math.max(1, cyber + kinetic + diplomatic);
    return {
      cyber: Math.round((cyber / total) * 100),
      kinetic: Math.round((kinetic / total) * 100),
      diplomatic: Math.round((diplomatic / total) * 100),
      score: Math.min(99, Math.round(50 + (kinetic * 3 + cyber * 2 + diplomatic) * 1.5)),
      sampleSize: liveSignals.length,
    };
  }, [liveSignals]);

  // Tension Index trend sparkline (last 24h) — a separate, real-data-only fetch, not a
  // refactor of tensionMetrics above. Uses its own chronologically-sorted signal fetch
  // (existing /api/signals?window=24h, now with an optional ?limit= override so a 24h
  // window isn't starved by the feed's default severity-sorted cap of 20) bucketed into
  // 3h windows. scoreSignalBucket() intentionally duplicates the scoring formula from
  // tensionMetrics rather than sharing code with it, so that block stays untouched.
  const TENSION_HISTORY_BUCKETS = 8;
  const TENSION_HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;

  const { data: tensionHistorySignals } = useQuery({
    queryKey: ["tension-history-signals"],
    queryFn: async () => {
      const res = await fetch("/api/signals?window=24h&sort=newest&limit=100");
      if (!res.ok) return [] as Signal[];
      const json = (await res.json()) as { signals?: Signal[] };
      return json.signals ?? [];
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  function scoreSignalBucket(bucket: Signal[]): number | null {
    if (bucket.length === 0) return null;
    let cyber = 0;
    let kinetic = 0;
    let diplomatic = 0;
    for (const s of bucket) {
      const t = (s.eventType || "").toLowerCase();
      const title = (s.title || "").toLowerCase();
      if (/cyber|hack|drone|tech|ai|digital|network|telecom|satellite/i.test(t + " " + title)) {
        cyber += 1;
      } else if (/military|navy|troops|strike|attack|missile|war|ship|tanker|border|conflict|weapon|defense/i.test(t + " " + title)) {
        kinetic += 1;
      } else if (/sanction|diplom|bank|trade|market|tariff|opec|bond|fund|asset|deal|negotiation|talks|economy/i.test(t + " " + title)) {
        diplomatic += 1;
      } else {
        kinetic += 1;
      }
    }
    return Math.min(99, Math.round(50 + (kinetic * 3 + cyber * 2 + diplomatic) * 1.5));
  }

  const tensionHistory = useMemo(() => {
    const rows = tensionHistorySignals ?? [];
    const bucketMs = TENSION_HISTORY_WINDOW_MS / TENSION_HISTORY_BUCKETS;
    const bucketHours = bucketMs / 3_600_000;
    const buckets: Signal[][] = Array.from({ length: TENSION_HISTORY_BUCKETS }, () => []);
    const now = Date.now();

    for (const s of rows) {
      const t = new Date(s.eventDate ?? s.createdAt).getTime();
      const age = now - t;
      if (!Number.isFinite(t) || age < 0 || age > TENSION_HISTORY_WINDOW_MS) continue;
      const idx = Math.min(TENSION_HISTORY_BUCKETS - 1, Math.floor(age / bucketMs));
      buckets[idx].push(s); // idx 0 = most recent bucket
    }

    // Reverse so index 0 is oldest — renders left (oldest) to right (most recent).
    return [...buckets].reverse().map((bucket, i) => {
      const idxFromNow = TENSION_HISTORY_BUCKETS - 1 - i;
      const hoursAgoLo = Math.round(idxFromNow * bucketHours);
      const hoursAgoHi = Math.round((idxFromNow + 1) * bucketHours);
      return {
        score: scoreSignalBucket(bucket),
        label: `${hoursAgoLo}–${hoursAgoHi}h ago`,
      };
    });
  }, [tensionHistorySignals]);

  return (
    <div className="relative w-full mt-16 h-[calc(100vh-64px)] bg-background overflow-hidden">
      <div className="absolute inset-0">
        <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />
        <div className="absolute inset-0 map-vignette pointer-events-none opacity-40" />

        {mapError && (
          <div className="absolute inset-0 bg-[#111111] flex items-center justify-center text-center p-8">
            <div className="max-w-md">
              <p
                className="text-sm font-semibold uppercase tracking-[0.3em] mb-3"
                style={{ color: "#4edea3" }}
              >
                Map unavailable
              </p>
              <p className="text-xs leading-relaxed text-[#bbcaca]">
                {mapError}
              </p>
            </div>
          </div>
        )}

        <div className="absolute inset-y-0 left-0 w-64 bg-gradient-to-r from-background to-transparent" />
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-background to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />
      </div>

      <div
        className="absolute bottom-2 left-2 z-20 text-[10px] text-on-surface-variant/80 px-2 py-1.5"
        suppressHydrationWarning
      >
        {BASEMAP_ATTRIBUTION}
      </div>

      {fallback && (
        <div className="absolute bottom-12 left-2 z-30">
          <div
            className="bg-yellow-600/95 text-black px-3 py-2 rounded shadow-md text-[11px] font-medium"
            suppressHydrationWarning
          >
            Signal feed degraded — {fallbackReason ?? "unknown"}. Showing last
            available data
            {fallbackLastUpdated ? (
              <span className="ml-2 text-[10px] text-black/80" suppressHydrationWarning>
                (updated{" "}
                {safeFormatDistanceToNow(fallbackLastUpdated)} ago)
              </span>
            ) : null}
          </div>
        </div>
      )}

      {!filtersCollapsed && (
      <section className="absolute top-8 left-8 w-80 glass rounded-xl p-6 border-l-2 border-primary/40">
        <button
          onClick={() => setFiltersCollapsed(true)}
          className="absolute -right-3 top-6 w-6 h-6 rounded-full bg-surface-container border border-outline-variant/30 flex items-center justify-center hover:bg-primary/20 transition-colors"
          aria-label="Collapse filters panel"
        >
          <span className="material-symbols-outlined text-[14px]">chevron_left</span>
        </button>
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <div className="label text-[10px] tracking-[0.2em] text-on-surface-variant uppercase">
                Global Tension Index
              </div>
              <div className="relative group">
                <button
                  type="button"
                  onClick={() => setTensionInfoOpen((v) => !v)}
                  aria-label="About the Global Tension Index"
                  className="flex items-center justify-center w-3.5 h-3.5 rounded-full text-on-surface-variant/60 hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-[13px] leading-none">info</span>
                </button>
                {/* Hover is pure CSS (group-hover) so it can never fight the click toggle's
                    React state — clicking to pin it open no longer gets immediately
                    undone by the hover that necessarily precedes a real click. */}
                <div
                  role="tooltip"
                  className={`absolute left-0 top-full mt-2 w-56 z-30 p-3 rounded-lg bg-surface-container-high border border-outline-variant/40 shadow-xl text-[10px] leading-relaxed text-on-surface-variant normal-case tracking-normal transition-opacity ${
                    tensionInfoOpen
                      ? "opacity-100 pointer-events-auto"
                      : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
                  }`}
                >
                  Composite score derived from regional conflict density, kinetic strikes, and maritime disruption metrics.
                </div>
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-4xl font-bold text-on-surface">
                {tensionMetrics.score}
              </span>
              <span className="font-mono text-[9px] text-on-surface-variant/70">
                from {tensionMetrics.sampleSize} active signal{tensionMetrics.sampleSize === 1 ? "" : "s"}
              </span>
            </div>
            {tensionHistory.some((b) => b.score != null) && (
              <div className="mt-2">
                <div className="flex items-end gap-[3px] h-6" aria-label="Tension index trend, last 24 hours">
                  {tensionHistory.map((b, i) => (
                    <div
                      key={i}
                      title={b.score != null ? `${b.label}: ${b.score}` : `${b.label}: not enough data`}
                      className={`flex-1 rounded-sm ${b.score != null ? "bg-primary/50" : "bg-surface-container-high"}`}
                      style={{ height: b.score != null ? `${Math.max(12, (b.score / 99) * 100)}%` : "15%" }}
                    />
                  ))}
                </div>
                <p className="font-mono text-[8px] text-on-surface-variant/50 mt-1 uppercase tracking-wider">
                  Last 24h trend
                </p>
              </div>
            )}
          </div>
          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/20">
            <span className="material-symbols-outlined text-primary">
              analytics
            </span>
          </div>
        </div>
        <div className="space-y-4 mb-8">
          <div>
            <div className="flex justify-between label text-[10px] text-on-surface-variant mb-1.5 uppercase tracking-wider">
              <span>Cyber Warfare</span>
              <span className="font-mono text-primary">
                {tensionMetrics.cyber}%
              </span>
            </div>
            <div className="h-1 bg-surface-container-high rounded-full overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${tensionMetrics.cyber}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between label text-[10px] text-on-surface-variant mb-1.5 uppercase tracking-wider">
              <span>Kinetic Conflict</span>
              <span className="font-mono text-primary">
                {tensionMetrics.kinetic}%
              </span>
            </div>
            <div className="h-1 bg-surface-container-high rounded-full overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${tensionMetrics.kinetic}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between label text-[10px] text-on-surface-variant mb-1.5 uppercase tracking-wider">
              <span>Diplomatic Friction</span>
              <span className="font-mono text-primary">
                {tensionMetrics.diplomatic}%
              </span>
            </div>
            <div className="h-1 bg-surface-container-high rounded-full overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${tensionMetrics.diplomatic}%` }}
              />
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="label text-[10px] tracking-[0.2em] text-on-surface-variant mb-2 uppercase">
            Filters
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-2">
              <button
                onClick={() => setTimeWindow("24h")}
                className={`px-2 py-1 rounded ${timeWindow === "24h" ? "bg-primary text-on-primary" : "bg-surface-container/20"}`}
              >
                24H
              </button>
              <button
                onClick={() => setTimeWindow("7d")}
                className={`px-2 py-1 rounded ${timeWindow === "7d" ? "bg-primary text-on-primary" : "bg-surface-container/20"}`}
              >
                7D
              </button>
              <button
                onClick={() => setTimeWindow("all")}
                className={`px-2 py-1 rounded ${timeWindow === "all" ? "bg-primary text-on-primary" : "bg-surface-container/20"}`}
              >
                All
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="map-filter-min-severity" className="label text-[10px] text-on-surface-variant">
              Min Severity
            </label>
            <select
              id="map-filter-min-severity"
              value={minSeverity}
              onChange={(e) => setMinSeverity(Number(e.target.value))}
              className={`ml-2 ${SELECT_CLASSES}`}
            >
              {[...Array(10)].map((_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="map-filter-category" className="label text-[10px] text-on-surface-variant">
              Category
            </label>
            <select
              id="map-filter-category"
              value={selectedCategory ?? ""}
              onChange={(e) => setSelectedCategory(e.target.value || null)}
              className={`ml-2 ${SELECT_CLASSES}`}
            >
              <option value="">All</option>
              {Array.from(
                new Set(signals.map((s) => s.eventType).filter(Boolean)),
              ).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="map-filter-region" className="label text-[10px] text-on-surface-variant">
              Region
            </label>
            <select
              id="map-filter-region"
              value={selectedRegion ?? ""}
              onChange={(e) => setSelectedRegion(e.target.value || null)}
              className={`ml-2 ${SELECT_CLASSES}`}
            >
              <option value="">All</option>
              {Array.from(
                new Set(signals.map((s) => s.region).filter(Boolean)),
              ).map((r) => (
                <option key={r as string} value={r as string}>
                  {r as string}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>
      )}
      {filtersCollapsed && (
        <button
          onClick={() => setFiltersCollapsed(false)}
          className="absolute top-8 left-8 w-10 h-10 rounded-full bg-surface-container glass border border-outline-variant/30 flex items-center justify-center hover:bg-primary/20 transition-colors z-10"
          aria-label="Expand filters panel"
        >
          <span className="material-symbols-outlined text-[16px]">chevron_right</span>
        </button>
      )}

      {!streamCollapsed && (
      <aside className="absolute top-0 right-0 h-full w-80 glass border-l border-outline-variant/30 flex flex-col">
        <button
          onClick={() => setStreamCollapsed(true)}
          className="absolute -left-3 top-6 w-6 h-6 rounded-full bg-surface-container border border-outline-variant/30 flex items-center justify-center hover:bg-primary/20 transition-colors"
          aria-label="Collapse live intelligence panel"
        >
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        </button>
        <div className="p-6 border-b border-outline-variant/30 bg-surface-container-lowest/40 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="label text-xs tracking-[0.2em] font-bold text-on-surface uppercase">
              Live Intelligence
            </span>
          </div>
          <IngestionStatusBanner />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 hide-scrollbar">
          {isLoading || isError ? (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton
                  key={i}
                  className="h-24 w-full bg-surface-container/40 rounded-lg"
                />
              ))}
            </div>
          ) : liveItems.length > 0 ? (
            liveItems.map((signal) => {
              const isUrgent = signal.severity >= 8;
              const borderStyle = isUrgent ? "border-error" : "border-primary";
              const isSelected = signal.id === selectedSignalId;

              return (
                <div
                  key={signal.id}
                  onClick={() => handleFeedSelect(signal)}
                  className={`p-3 rounded-lg border-l-2 ${borderStyle} transition-colors cursor-pointer group ${
                    isSelected
                      ? "bg-primary/15 ring-1 ring-primary/40"
                      : "bg-surface-container/40 hover:bg-surface-container/60"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`px-1.5 py-0.5 label text-[8px] border uppercase ${isUrgent ? "bg-error/10 text-error border-error/20" : "bg-primary/10 text-primary border-primary/20"}`}
                    >
                      {isUrgent ? "URGENT" : "SIGNAL"}
                    </span>
                    <span className="font-mono text-[9px] text-on-surface-variant">
                      {safeFormatDistanceToNow(signal.eventDate ?? signal.createdAt)}{" "}
                      ago
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-on-surface mb-2 font-medium line-clamp-2 group-hover:text-primary transition-colors">
                    {signal.title}
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/events/${signal.id}`);
                    }}
                    className="label text-[9px] text-primary flex items-center gap-1 group-hover:underline"
                  >
                    VIEW DETAILS
                    <span className="material-symbols-outlined text-[10px]">
                      arrow_forward
                    </span>
                  </button>
                </div>
              );
            })
          ) : (
            <div className="flex-1 flex items-center justify-center p-6 grayscale opacity-50">
              <span className="label text-[10px] tracking-widest uppercase">
                No live stream data
              </span>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-outline-variant/30">
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full bg-primary-container py-3 rounded-lg flex items-center justify-center gap-3 hover:brightness-110 transition-all text-on-primary-container font-bold label text-xs cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">terminal</span>
            OPEN FULL TERMINAL
          </button>
        </div>
      </aside>
      )}
      {streamCollapsed && (
        <button
          onClick={() => setStreamCollapsed(false)}
          className="absolute top-8 right-8 w-10 h-10 rounded-full bg-surface-container glass border border-outline-variant/30 flex items-center justify-center hover:bg-primary/20 transition-colors z-10"
          aria-label="Expand live intelligence panel"
        >
          <span className="material-symbols-outlined text-[16px]">chevron_left</span>
        </button>
      )}
    </div>
  );
}
