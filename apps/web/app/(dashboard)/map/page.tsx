"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Signal } from "@blue-beacon-research/shared";
import { formatDistanceToNowStrict } from "date-fns";

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

export default function MapPage() {
  const router = useRouter();
  // Use existing feed hook (fetch + SSE). We'll rely on server-side filtering when applying filters.
  const {
    liveSignals,
    isLoading,
    isError,
    fallback,
    fallbackReason,
    fallbackLastUpdated,
  } = useSignalFeed();
  const signals = liveSignals ?? [];
  const serverSignalsRef = useRef<Signal[] | null>(null);
  const [timeWindow, setTimeWindow] = useState<"24h" | "7d" | "all">("all");
  const [minSeverity, setMinSeverity] = useState<number>(1);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

  const geolocatedSignals = useMemo(() => {
    const source = (serverSignalsRef.current ?? signals) as Signal[];
    return source.filter(
      (signal) =>
        typeof signal.lat === "number" &&
        typeof signal.lng === "number" &&
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
  }, [signals, minSeverity, selectedCategory, selectedRegion, timeWindow]);
  const liveItems = signals.slice(0, 6);

  const [mapError, setMapError] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapLibRef = useRef<any>(null);

  const signalsGeoJsonRef = useRef<any | null>(null);
  const popupRef = useRef<any | null>(null);

  // Helper: convert signals to GeoJSON FeatureCollection, excluding invalid coordinates
  function signalsToGeoJSON(items: Signal[]) {
    const features = items
      .filter(
        (s) =>
          typeof s.lat === "number" &&
          typeof s.lng === "number" &&
          isFinite(s.lat) &&
          isFinite(s.lng) &&
          s.lat >= -90 &&
          s.lat <= 90 &&
          s.lng >= -180 &&
          s.lng <= 180,
      )
      .map((s) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.lng!, s.lat!] },
        properties: {
          id: s.id,
          title: s.title,
          severity: s.severity,
          country: s.country,
          region: s.region,
          eventType: s.eventType,
          eventDate: s.eventDate ?? s.createdAt,
          summary: s.summary,
        },
      }));

    return { type: "FeatureCollection", features };
  }

  function handleFeedSelect(signal: Signal) {
    const map = mapRef.current;
    const maplib = mapLibRef.current;
    if (!map || !maplib) {
      // fallback: navigate to details
      router.push(`/events/${signal.id}`);
      return;
    }

    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }

    if (typeof signal.lat === "number" && typeof signal.lng === "number") {
      map.easeTo({
        center: [signal.lng, signal.lat],
        zoom: Math.max(map.getZoom(), 5),
      });

      const html = `<div style="font-family: Inter, sans-serif; color: #e5e2e1; width: 260px;">
        <div style="font-size: 13px; font-weight: 700; margin-bottom: 6px;">${signal.title}</div>
        <div style="font-size: 10px; color: #bbcaca; margin-bottom: 6px;">${signal.country ?? "Global"}</div>
        <div style="font-size: 10px; color: #4edea3; font-weight: 700;">${formatDistanceToNowStrict(new Date(signal.eventDate ?? signal.createdAt))}</div>
        <div style="margin-top:8px; text-align:right;"><a href=\"/events/${signal.id}\" style=\"color:#4edea3;font-weight:700;text-decoration:none\">VIEW EVENT</a></div>
      </div>`;

      const popup = new maplib.Popup({ offset: 12, closeButton: false })
        .setLngLat([signal.lng, signal.lat])
        .setHTML(html)
        .addTo(map);
      popupRef.current = popup;
    } else {
      // No coordinates: navigate to event detail
      router.push(`/events/${signal.id}`);
    }
  }

  useEffect(() => {
    let canceled = false;

    async function initMap() {
      if (!mapContainerRef.current) return;

      try {
        const module = await import("maplibre-gl");
        const maplib = module;

        // H1 fix: inject MapLibre CSS if not already present
        // Without this the map canvas renders blank — no tiles, no attribution styling
        if (!document.querySelector('link[data-maplibre-css]')) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/maplibre-gl@4/dist/maplibre-gl.css';
          link.setAttribute('data-maplibre-css', '1');
          document.head.appendChild(link);
        }

        if (canceled || !mapContainerRef.current) return;

        mapLibRef.current = maplib;
        // Create a raster tile style for OpenStreetMap tiles with proper attribution
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

        try {
          // Add compact attribution control (OpenStreetMap credit)
          map.addControl(new maplib.AttributionControl({ compact: true }));
        } catch (err) {
          // Non-fatal: continue without attribution control if it fails
          console.warn("[map] addControl failed", err);
        }

        map.on("load", () => {
          try {
            // Add an initially-empty GeoJSON source for signals with clustering enabled
            if (!map.getSource("signals")) {
              map.addSource("signals", {
                type: "geojson",
                data: { type: "FeatureCollection", features: [] },
                cluster: true,
                clusterRadius: 50,
                clusterMaxZoom: 14,
              });
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
                  "text-font": ["Inter Regular"],
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
              const country = props.country ?? "Global";
              const eventDate =
                props.eventDate ?? props.createdAt ?? new Date().toISOString();
              const summary = props.summary ?? "";
              const html = `<div style="font-family: Inter, sans-serif; color: #e5e2e1; width: 260px;">
                <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #86948a; margin-bottom: 6px;">${sev >= 8 ? "Critical Event" : "Active Signal"}</div>
                <div style="font-size: 13px; font-weight: 700; margin-bottom: 6px;">${title}</div>
                <div style="font-size: 10px; color: #bbcaca; margin-bottom: 6px;">${country}</div>
                <div style="font-size: 10px; color: #4edea3; font-weight: 700;">${formatDistanceToNowStrict(new Date(eventDate))}</div>
                <div style="margin-top:8px; font-size:12px;">${summary ? (summary.length > 180 ? summary.slice(0, 177) + "..." : summary) : ""}</div>
                <div style="margin-top:8px; text-align:right;"><a href=\"/events/${props.id}\" style=\"color:#4edea3;font-weight:700;text-decoration:none\">VIEW EVENT</a></div>
              </div>`;

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

  // Fetch server-side filtered signals when filters change so filters affect actual dataset
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
        serverSignalsRef.current = json.signals ?? [];

        // If map exists, update source data
        const map = mapRef.current;
        if (map && map.getSource && map.getSource("signals")) {
          const fc = signalsToGeoJSON(serverSignalsRef.current);
          try {
            map.getSource("signals").setData(fc);
          } catch {
            setTimeout(() => map.getSource("signals").setData(fc), 50);
          }
        }
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
    const counts = { cyber: 0, kinetic: 0, diplomatic: 0 };
    for (const s of liveSignals) {
      const t = (s.eventType || "").toLowerCase();
      const title = (s.title || "").toLowerCase();

      if (t.includes("cyber") || title.includes("cyber")) counts.cyber += 1;
      else if (
        t.includes("attack") ||
        t.includes("strike") ||
        t.includes("kinetic") ||
        title.includes("strike") ||
        title.includes("attack")
      )
        counts.kinetic += 1;
      else if (
        t.includes("sanction") ||
        t.includes("diplom") ||
        title.includes("sanction") ||
        title.includes("diplom")
      )
        counts.diplomatic += 1;
      else counts.kinetic += 0;
    }

    const total = Math.max(
      1,
      counts.cyber + counts.kinetic + counts.diplomatic,
    );
    return {
      cyber: Math.round((counts.cyber / total) * 100),
      kinetic: Math.round((counts.kinetic / total) * 100),
      diplomatic: Math.round((counts.diplomatic / total) * 100),
      score:
        Math.round(
          ((counts.cyber + counts.kinetic + counts.diplomatic) / total) *
            100 *
            0.75,
        ) || 0,
    };
  }, [liveSignals]);

  return (
    <main className="fixed inset-0 top-16 left-[256px] bg-background overflow-hidden">
      <div className="absolute inset-0 grayscale contrast-125 opacity-40">
        <div ref={mapContainerRef} className="absolute inset-0" />
        <div className="absolute inset-0 map-vignette" />

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

      <div className="absolute bottom-2 left-2 z-20 text-[10px] text-on-surface-variant/80 px-2 py-1.5">
        {BASEMAP_ATTRIBUTION}
      </div>

      {fallback && (
        <div className="absolute bottom-12 left-2 z-30">
          <div className="bg-yellow-600/95 text-black px-3 py-2 rounded shadow-md text-[11px] font-medium">
            Signal feed degraded — {fallbackReason ?? "unknown"}. Showing last
            available data
            {fallbackLastUpdated ? (
              <span className="ml-2 text-[10px] text-black/80">
                (updated{" "}
                {formatDistanceToNowStrict(new Date(fallbackLastUpdated))} ago)
              </span>
            ) : null}
          </div>
        </div>
      )}

      <section className="absolute top-8 left-8 w-80 glass rounded-xl p-6 border-l-2 border-primary/40">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="label text-[10px] tracking-[0.2em] text-on-surface-variant mb-1 uppercase">
              Global Tension Index
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-4xl font-bold text-on-surface">
                74.8
              </span>
              <span className="font-mono text-sm text-error font-bold">
                ▲ 2.4
              </span>
            </div>
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
            <label className="label text-[10px] text-on-surface-variant">
              Min Severity
            </label>
            <select
              value={minSeverity}
              onChange={(e) => setMinSeverity(Number(e.target.value))}
              className="ml-2 bg-surface-container/20 rounded px-2 py-1 text-sm"
            >
              {[...Array(10)].map((_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="label text-[10px] text-on-surface-variant">
              Category
            </label>
            <select
              value={selectedCategory ?? ""}
              onChange={(e) => setSelectedCategory(e.target.value || null)}
              className="ml-2 bg-surface-container/20 rounded px-2 py-1 text-sm"
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
            <label className="label text-[10px] text-on-surface-variant">
              Region
            </label>
            <select
              value={selectedRegion ?? ""}
              onChange={(e) => setSelectedRegion(e.target.value || null)}
              className="ml-2 bg-surface-container/20 rounded px-2 py-1 text-sm"
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

      <aside className="absolute top-0 right-0 h-full w-80 glass border-l border-outline-variant/30 flex flex-col">
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

              return (
                <div
                  key={signal.id}
                  onClick={() => handleFeedSelect(signal)}
                  className={`p-3 bg-surface-container/40 rounded-lg border-l-2 ${borderStyle} hover:bg-surface-container/60 transition-colors cursor-pointer group`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`px-1.5 py-0.5 label text-[8px] border uppercase ${isUrgent ? "bg-error/10 text-error border-error/20" : "bg-primary/10 text-primary border-primary/20"}`}
                    >
                      {isUrgent ? "URGENT" : "SIGNAL"}
                    </span>
                    <span className="font-mono text-[9px] text-on-surface-variant">
                      {formatDistanceToNowStrict(
                        new Date(signal.eventDate ?? signal.createdAt),
                      )}{" "}
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
    </main>
  );
}
