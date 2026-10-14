"use client";

import { useEffect, useMemo, useState } from "react";
import type { Chokepoint, Signal } from "@blue-beacon-research/shared";
import { CHOKEPOINTS } from "@blue-beacon-research/shared";
import { chokepointDirectionTally, signalsNearChokepoint } from "@/lib/chokepoints";
import {
  groupSignalsByLocation,
  type LocationOrder,
} from "@/lib/location-groups";

type GeoSignal = Signal & { lat: number; lng: number };

const ORDERS: { value: LocationOrder; label: string }[] = [
  { value: "recent", label: "Recent" },
  { value: "count", label: "Count" },
  { value: "up", label: "Up" },
  { value: "down", label: "Down" },
  { value: "az", label: "A–Z" },
];

function tallyText(tally: { up: number; down: number; volatile: number; neutral: number }): string {
  const parts: string[] = [];
  if (tally.up > 0) parts.push(`Up ${tally.up}`);
  if (tally.down > 0) parts.push(`Down ${tally.down}`);
  if (tally.volatile > 0) parts.push(`Volatile ${tally.volatile}`);
  if (tally.neutral > 0) parts.push(`Neutral ${tally.neutral}`);
  return parts.join(" · ");
}

function LocationListBody({
  signals,
  radiusKm,
  selectedCountry,
  onSelectCountry,
  onClearCountry,
  onSelectChokepoint,
}: {
  signals: GeoSignal[];
  radiusKm: number;
  selectedCountry: string | null;
  onSelectCountry: (country: string) => void;
  onClearCountry: () => void;
  onSelectChokepoint: (chokepoint: Chokepoint) => void;
}) {
  const [order, setOrder] = useState<LocationOrder>("recent");
  const grouping = useMemo(
    () => groupSignalsByLocation(signals, order),
    [signals, order],
  );
  const chokepointRows = useMemo(
    () =>
      CHOKEPOINTS.map((cp) => {
        const matched = signalsNearChokepoint(signals, cp, radiusKm);
        return {
          chokepoint: cp,
          count: matched.length,
          tally: chokepointDirectionTally(matched, cp),
        };
      }),
    [signals, radiusKm],
  );

  return (
    <div className="flex flex-col min-h-0 gap-3">
      <p className="text-[12px] md:text-[11px] text-on-surface-variant leading-relaxed" data-testid="location-stats">
        Signals with a location: {grouping.withLocation} of {grouping.total} · Up: {grouping.up} · Down: {grouping.down} · Unique locations: {grouping.uniqueLocations}
      </p>
      <div className="flex items-center justify-between gap-2">
        <label className="label text-[10px] tracking-[0.14em] uppercase text-on-surface-variant" htmlFor="location-order">
          Order
        </label>
        <select
          id="location-order"
          data-testid="location-order"
          value={order}
          onChange={(e) => setOrder(e.target.value as LocationOrder)}
          className="bg-surface-container border border-outline-variant/40 rounded-md px-2 py-1 text-[12px] text-on-surface"
        >
          {ORDERS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      {selectedCountry && (
        <button
          type="button"
          onClick={onClearCountry}
          className="label text-[10px] text-primary text-left hover:underline"
        >
          Show all
        </button>
      )}
      <ul className="space-y-1 overflow-y-auto">
        {grouping.groups.map((group) => {
          const selected = selectedCountry === group.country;
          return (
            <li key={group.country}>
              <button
                type="button"
                data-testid="location-row"
                data-country={group.country}
                aria-pressed={selected}
                onClick={() => onSelectCountry(group.country)}
                className={`w-full text-left px-2 py-1.5 rounded-md text-[12px] md:text-[11px] hover:bg-white/10 transition-colors ${
                  selected ? "bg-primary/15 ring-1 ring-primary/40" : ""
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{group.country}</span>
                  <span className="font-mono text-on-surface-variant">{group.count}</span>
                </span>
                <span className="text-on-surface-variant text-[11px] md:text-[10px]">
                  Up {group.up} · Down {group.down}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div>
        <h3 className="label text-[10px] tracking-[0.16em] uppercase text-on-surface-variant mb-1">
          Chokepoints
        </h3>
        <ul className="space-y-1 overflow-y-auto">
          {chokepointRows.map(({ chokepoint, count, tally }) => {
            const directions = tallyText(tally);
            return (
              <li key={chokepoint.id}>
                <button
                  type="button"
                  data-testid="chokepoint-row"
                  data-chokepoint={chokepoint.id}
                  onClick={() => onSelectChokepoint(chokepoint)}
                  className="w-full text-left px-2 py-1.5 rounded-md text-[12px] md:text-[11px] hover:bg-white/10 transition-colors"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium">{chokepoint.name}</span>
                    <span className="font-mono text-on-surface-variant">{count}</span>
                  </span>
                  {chokepoint.commodities.length === 0 ? (
                    <span className="block text-on-surface-variant text-[11px] md:text-[10px]">
                      No commodity link found (no source)
                    </span>
                  ) : directions ? (
                    <span className="block text-on-surface-variant text-[11px] md:text-[10px]">
                      {directions}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[10px] text-on-surface-variant/80">
          Counts are signals within {radiusKm} km (a display choice, not a sourced threshold).
        </p>
      </div>
    </div>
  );
}

export function LocationList({
  signals,
  radiusKm,
  selectedCountry,
  onSelectCountry,
  onClearCountry,
  onSelectChokepoint,
  desktopOpen,
  onToggleDesktop,
  desktopLeft,
  desktopRight,
  mobileExpanded,
  onToggleMobile,
}: {
  signals: GeoSignal[];
  radiusKm: number;
  selectedCountry: string | null;
  onSelectCountry: (country: string) => void;
  onClearCountry: () => void;
  onSelectChokepoint: (chokepoint: Chokepoint) => void;
  desktopOpen: boolean;
  onToggleDesktop: () => void;
  desktopLeft: string;
  desktopRight: string;
  mobileExpanded: boolean;
  onToggleMobile: () => void;
}) {
  const [layout, setLayout] = useState<"mobile" | "desktop" | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setLayout(mq.matches ? "desktop" : "mobile");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  if (!layout) return null;

  const body = (
    <LocationListBody
      signals={signals}
      radiusKm={radiusKm}
      selectedCountry={selectedCountry}
      onSelectCountry={onSelectCountry}
      onClearCountry={onClearCountry}
      onSelectChokepoint={onSelectChokepoint}
    />
  );

  if (layout === "desktop") {
    if (!desktopOpen) {
      return (
        <button
          type="button"
          onClick={onToggleDesktop}
          className="hidden md:flex absolute bottom-10 z-20 items-center px-3 py-2 rounded-md bg-black/70 backdrop-blur text-[12px] font-medium text-on-surface"
          style={{ left: desktopLeft }}
        >
          Locations
        </button>
      );
    }
    return (
      <section
        aria-label="Locations"
        className="hidden md:flex flex-col absolute bottom-10 z-20 max-h-[min(52vh,28rem)] glass rounded-xl border border-outline-variant/30 p-4"
        style={{
          left: desktopLeft,
          width: "min(20rem, calc(100% - 2.5rem))",
          maxWidth: `max(16rem, calc(100% - ${desktopLeft} - ${desktopRight}))`,
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="label text-xs tracking-[0.16em] font-bold text-on-surface uppercase">
            Locations
          </h2>
          <button
            type="button"
            onClick={onToggleDesktop}
            aria-label="Hide locations"
            className="w-6 h-6 rounded-full bg-surface-container border border-outline-variant/30 flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto">{body}</div>
      </section>
    );
  }

  return (
    <div className="md:hidden fixed inset-x-0 z-[35] flex flex-col" style={{ bottom: mobileExpanded ? 60 : 132 }}>
      {mobileExpanded && (
        <div className="overflow-y-auto bg-surface-container-lowest/95 backdrop-blur-md border-t border-x border-outline-variant/30 rounded-t-2xl px-4 pt-2 pb-4 max-h-[calc(70vh-60px)]">
          <div className="w-10 h-1 rounded-full bg-outline-variant/40 mx-auto mb-3" />
          <h2 className="label text-xs tracking-[0.16em] font-bold text-on-surface uppercase mb-3">
            Locations
          </h2>
          {body}
        </div>
      )}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleMobile}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleMobile();
          }
        }}
        aria-expanded={mobileExpanded}
        aria-label={mobileExpanded ? "Collapse locations" : "Expand locations"}
        className={`bg-surface-container-lowest/95 backdrop-blur-md border border-outline-variant/30 px-4 py-3 flex items-center justify-between min-h-[44px] cursor-pointer ${
          mobileExpanded ? "" : "rounded-t-2xl mx-3"
        }`}
      >
        <span className="label text-[10px] tracking-[0.16em] font-bold text-on-surface uppercase">
          Locations
        </span>
        <span className="material-symbols-outlined text-on-surface-variant">
          {mobileExpanded ? "expand_more" : "expand_less"}
        </span>
      </div>
    </div>
  );
}
