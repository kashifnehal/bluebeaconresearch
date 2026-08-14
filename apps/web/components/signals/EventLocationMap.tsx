"use client";

import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { BASEMAP_TILE_URLS, BASEMAP_ATTRIBUTION } from "@/lib/map-config";

export function EventLocationMap({
  lng,
  lat,
  zoom = 4,
}: {
  lng: number;
  lat: number;
  zoom?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    let canceled = false;

    async function init() {
      if (!containerRef.current) return;
      const maplib = await import("maplibre-gl");
      if (canceled || !containerRef.current) return;

      const map = new maplib.Map({
        container: containerRef.current,
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
            { id: "osm-tiles", type: "raster", source: "osm", minzoom: 0, maxzoom: 19 },
          ],
        },
        center: [lng, lat],
        zoom,
        interactive: true,
      });

      new maplib.Marker({ color: "#4edea3" }).setLngLat([lng, lat]).addTo(map);
      map.addControl(new maplib.AttributionControl({ compact: true }));
      mapRef.current = map;

      setTimeout(() => map.resize(), 100);
    }

    init();
    return () => {
      canceled = true;
      mapRef.current?.remove?.();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lng, lat]);

  return <div ref={containerRef} className="w-full h-full" />;
}
