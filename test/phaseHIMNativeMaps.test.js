import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resetFleetStore,
  seedFleetFromCars,
  patchFleetLive,
} from "../src/utils/fleetPositionStore.js";
import {
  carToFleetFeature,
  carsToFleetFeatureCollection,
  FLEET_SOURCE_ID,
  FLEET_HIT_LAYER_IDS,
} from "../src/pages/TenantDashboard/Maps/fleetGeoJson.js";
import { diffVisibleMarkerIds } from "../src/pages/TenantDashboard/Maps/googleClusterVisibility.js";
import {
  decideRealtimeClusterReloadAction,
  GOOGLE_SUPERCLUSTER_OPTIONS,
} from "../src/pages/TenantDashboard/Maps/googleClusterGate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, "../src");

describe("Phase H — map-native GeoJSON fleet", () => {
  it("carToFleetFeature preserves id, coords, color, heading", () => {
    resetFleetStore();
    const car = {
      id: "B",
      name: "Bus",
      position: { lat: 24.5, lng: 46.7 },
      speed: 40,
      direction: 90,
      lastSignel: Date.now(),
      lastMovingReceivedAtMs: Date.now(),
      lastFixAtMs: Date.now(),
      isOffline: false,
    };
    seedFleetFromCars([car]);
    const feature = carToFleetFeature(car, null);
    assert.equal(feature.properties.carId, "B");
    assert.deepEqual(feature.geometry.coordinates, [46.7, 24.5]);
    assert.equal(feature.properties.direction, 90);
    assert.equal(feature.properties.color, "#22c55e");
  });

  it("selected flag and FeatureCollection dedupe by id", () => {
    const cars = [
      {
        id: 1,
        position: { lat: 1, lng: 1 },
        speed: 0,
        direction: 0,
        lastSignel: Date.now(),
      },
      {
        id: 1,
        position: { lat: 2, lng: 2 },
        speed: 0,
        direction: 10,
        lastSignel: Date.now(),
      },
    ];
    const fc = carsToFleetFeatureCollection(cars, 1);
    assert.equal(fc.features.length, 1);
    assert.equal(fc.features[0].properties.selected, 1);
  });

  it("MapLibre/MapTiler/Mapbox source has no React Marker fleet loop", () => {
    for (const f of ["MapLibreMapView.jsx", "MapTilerMapView.jsx", "MapboxMapView.jsx"]) {
      const src = readFileSync(
        join(srcRoot, "pages/TenantDashboard/Maps", f),
        "utf8",
      );
      assert.match(src, /Source/);
      assert.match(src, /Layer/);
      assert.doesNotMatch(src, /validCars\.map\s*\(\s*\(car\)/);
      assert.match(src, /FLEET_SOURCE_ID/);
    }
    assert.ok(FLEET_HIT_LAYER_IDS.includes("fleet-circles"));
  });

  it("live patch updates feature color/coords via store merge", () => {
    resetFleetStore();
    const car = {
      id: "B",
      position: { lat: 1, lng: 1 },
      speed: 0,
      direction: 0,
      lastSignel: Date.now(),
      isOffline: false,
    };
    seedFleetFromCars([car]);
    patchFleetLive("B", {
      position: { lat: 9, lng: 9 },
      speed: 50,
      direction: 180,
      lastMovingReceivedAtMs: Date.now(),
      lastFixAtMs: Date.now(),
    });
    const feature = carToFleetFeature(car, null);
    assert.deepEqual(feature.geometry.coordinates, [9, 9]);
    assert.equal(feature.properties.direction, 180);
    assert.equal(feature.properties.color, "#22c55e");
  });
});

describe("Phase I — map provider lazy loading", () => {
  it("TenantDashboard lazy-imports providers; default Google has no static MapLibre/Mapbox imports", () => {
    const td = readFileSync(
      join(srcRoot, "pages/TenantDashboard/TenantDashboard.jsx"),
      "utf8",
    );
    assert.match(td, /lazy\s*\(\s*\(\)\s*=>\s*import\("\.\/Maps\/GoogleMapView"\)/);
    assert.match(td, /lazy\s*\(\s*\(\)\s*=>\s*import\("\.\/Maps\/MapLibreMapView"\)/);
    assert.match(td, /lazy\s*\(\s*\(\)\s*=>\s*import\("\.\/Maps\/MapboxMapView"\)/);
    assert.match(td, /Suspense/);
    assert.doesNotMatch(td, /import MapLibreMapView from/);
    assert.doesNotMatch(td, /import MapboxMapView from/);
    assert.doesNotMatch(td, /import "mapbox-gl\/dist\/mapbox-gl\.css"/);
  });
});

describe("Phase M1 — cluster visibility diff", () => {
  it("diffVisibleMarkerIds only reports changes", () => {
    const prev = new Set(["A", "B", "C"]);
    const next = new Set(["B", "C", "D"]);
    const { toShow, toHide } = diffVisibleMarkerIds(prev, next);
    assert.deepEqual(toShow.sort(), ["D"]);
    assert.deepEqual(toHide.sort(), ["A"]);
  });

  it("E2a cluster-off gate still mark_stale", () => {
    assert.equal(
      decideRealtimeClusterReloadAction({
        clustersEnabled: false,
        zoom: 10,
        maxZoom: GOOGLE_SUPERCLUSTER_OPTIONS.maxZoom,
      }),
      "mark_stale",
    );
  });
});
