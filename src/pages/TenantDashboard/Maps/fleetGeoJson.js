import { getCarStatus } from "../../../utils/getCarStatus.js";
import { mergeCarWithFleet } from "../../../utils/fleetPositionStore.js";

/**
 * Shared vehicle → GeoJSON for MapLibre / MapTiler / Mapbox native layers.
 * Live fields come from mergeCarWithFleet (fleetPositionStore).
 */

export function carToFleetFeature(car, selectedCarId = null) {
  if (!car) return null;
  const merged = mergeCarWithFleet(car);
  const lat = merged?.position?.lat;
  const lng = merged?.position?.lng;
  const ok =
    typeof lat === "number" &&
    typeof lng === "number" &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lng);
  if (!ok || merged?.id == null) return null;

  const selected = selectedCarId != null && merged.id === selectedCarId;
  return {
    type: "Feature",
    // Promote id for Mapbox/MapLibre feature-state if needed
    id:
      typeof merged.id === "number"
        ? merged.id
        : Number.parseInt(String(merged.id), 10) || undefined,
    geometry: {
      type: "Point",
      coordinates: [lng, lat],
    },
    properties: {
      carId: merged.id,
      color: getCarStatus(merged).color,
      direction: Number(merged.direction) || 0,
      name: merged.name || "",
      selected: selected ? 1 : 0,
    },
  };
}

export function carsToFleetFeatureCollection(cars, selectedCarId = null) {
  const byId = new Map();
  (cars || []).forEach((car) => {
    const feature = carToFleetFeature(car, selectedCarId);
    if (!feature) return;
    byId.set(feature.properties.carId, feature);
  });
  return {
    type: "FeatureCollection",
    features: Array.from(byId.values()),
  };
}

/** Circle + oriented arrow symbol — no per-vehicle React DOM markers. */
export const FLEET_CIRCLE_LAYER = {
  id: "fleet-circles",
  type: "circle",
  paint: {
    "circle-radius": [
      "case",
      ["==", ["get", "selected"], 1],
      9,
      6,
    ],
    "circle-color": ["get", "color"],
    "circle-opacity": 0.92,
    "circle-stroke-width": [
      "case",
      ["==", ["get", "selected"], 1],
      2.5,
      1,
    ],
    "circle-stroke-color": "#111827",
  },
};

export const FLEET_ARROW_LAYER = {
  id: "fleet-arrows",
  type: "symbol",
  layout: {
    "text-field": "▲",
    "text-size": [
      "case",
      ["==", ["get", "selected"], 1],
      14,
      11,
    ],
    "text-rotate": ["get", "direction"],
    "text-rotation-alignment": "map",
    "text-allow-overlap": true,
    "text-ignore-placement": true,
  },
  paint: {
    "text-color": "#ffffff",
    "text-halo-color": "#111827",
    "text-halo-width": 0.6,
  },
};

export const FLEET_LABEL_LAYER = {
  id: "fleet-labels",
  type: "symbol",
  layout: {
    "text-field": ["get", "name"],
    "text-size": 11,
    "text-offset": [0, 1.4],
    "text-anchor": "top",
    "text-optional": true,
    "text-allow-overlap": false,
  },
  paint: {
    "text-color": "#111827",
    "text-halo-color": "#ffffff",
    "text-halo-width": 1.2,
  },
};

export const FLEET_SOURCE_ID = "fleet";
export const FLEET_HIT_LAYER_IDS = ["fleet-circles", "fleet-arrows"];
