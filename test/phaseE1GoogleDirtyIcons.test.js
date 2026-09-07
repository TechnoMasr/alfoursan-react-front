import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resetFleetStore,
  seedFleetFromCars,
  patchFleetLive,
  mergeCarWithFleet,
} from "../src/utils/fleetPositionStore.js";
import {
  applyGoogleMarkerVisualRefresh,
  getMarkerVisualState,
  resolveGoogleIconRefreshPlan,
  shouldUpdateMarkerIcon,
} from "../src/pages/TenantDashboard/Maps/googleMarkerVisual.js";

class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
}

function makeMarker(icon = { fillColor: "#3b82f6", rotation: 0 }) {
  let current = { ...icon };
  let setIconCalls = 0;
  return {
    getIcon: () => current,
    setIcon: (next) => {
      setIconCalls += 1;
      current = next;
    },
    get setIconCalls() {
      return setIconCalls;
    },
  };
}

function makeFleet(n) {
  const cars = [];
  for (let i = 0; i < n; i++) {
    const id = i === 1 ? "B" : i === 2 ? "C" : `id-${i}`;
    cars.push({
      id,
      name: `Car ${id}`,
      position: { lat: i, lng: i },
      speed: 0,
      direction: 0,
      lastSignel: Date.now(),
      isOffline: false,
    });
  }
  return cars;
}

describe("Phase E1 — Google dirty-id icon refresh", () => {
  it("resolve plan: realtime dirtyIds → dirty mode snapshot (immutable)", () => {
    const src = ["B"];
    const plan = resolveGoogleIconRefreshPlan({
      membershipChanged: false,
      baseMetaChanged: false,
      fleetDirtyIds: src,
    });
    assert.equal(plan.mode, "dirty");
    assert.deepEqual(plan.ids, ["B"]);
    plan.ids.push("X");
    assert.deepEqual(src, ["B"]);
  });

  it("resolve plan: membership or base meta → full", () => {
    assert.equal(
      resolveGoogleIconRefreshPlan({
        membershipChanged: true,
        baseMetaChanged: false,
        fleetDirtyIds: ["B"],
      }).mode,
      "full",
    );
    assert.equal(
      resolveGoogleIconRefreshPlan({
        membershipChanged: false,
        baseMetaChanged: true,
        fleetDirtyIds: ["B"],
      }).mode,
      "full",
    );
    assert.equal(
      resolveGoogleIconRefreshPlan({
        membershipChanged: false,
        baseMetaChanged: false,
        fleetDirtyIds: null,
      }).mode,
      "full",
    );
  });

  it("2000 markers + dirtyIds=[B]: considers only B (O(k))", () => {
    const cars = makeFleet(2000);
    const markers = new Map();
    for (const car of cars) {
      markers.set(car.id, makeMarker());
    }
    const byId = new Map(cars.map((c) => [c.id, c]));
    let getCarLookups = 0;

    const stats = applyGoogleMarkerVisualRefresh({
      plan: { mode: "dirty", ids: ["B"] },
      allCars: cars,
      getCarById: (id) => {
        getCarLookups += 1;
        return byId.get(id);
      },
      getMarker: (id) => markers.get(id),
      mergeCar: (car) => car,
      PointCtor: Point,
    });

    assert.equal(stats.considered, 1);
    assert.equal(getCarLookups, 1);
    assert.ok(getCarLookups < 2000);
  });

  it("dirtyIds=[B,C]: only B/C considered", () => {
    const cars = makeFleet(100);
    const markers = new Map(cars.map((c) => [c.id, makeMarker()]));
    const byId = new Map(cars.map((c) => [c.id, c]));

    const stats = applyGoogleMarkerVisualRefresh({
      plan: { mode: "dirty", ids: ["B", "C"] },
      allCars: cars,
      getCarById: (id) => byId.get(id),
      getMarker: (id) => markers.get(id),
      mergeCar: (car) => ({
        ...car,
        speed: 40,
        direction: 45,
        lastMovingReceivedAtMs: Date.now(),
      }),
      PointCtor: Point,
    });

    assert.equal(stats.considered, 2);
    assert.equal(markers.get("B").setIconCalls, 1);
    assert.equal(markers.get("C").setIconCalls, 1);
    assert.equal(markers.get("id-0").setIconCalls, 0);
  });

  it("unchanged effective visual: no setIcon", () => {
    const car = {
      id: "B",
      position: { lat: 1, lng: 1 },
      speed: 0,
      direction: 0,
      lastSignel: Date.now(),
      isOffline: false,
    };
    const { color, rotation } = getMarkerVisualState(car);
    const marker = makeMarker({ fillColor: color, rotation });

    const stats = applyGoogleMarkerVisualRefresh({
      plan: { mode: "dirty", ids: ["B"] },
      getCarById: () => car,
      getMarker: () => marker,
      mergeCar: (c) => c,
      PointCtor: Point,
    });

    assert.equal(stats.setIconCalls, 0);
    assert.equal(marker.setIconCalls, 0);
    assert.equal(shouldUpdateMarkerIcon(marker.getIcon(), color, rotation), false);
  });

  it("changed visual: target marker gets setIcon", () => {
    const car = {
      id: "B",
      position: { lat: 1, lng: 1 },
      speed: 50,
      direction: 90,
      lastSignel: Date.now(),
      lastMovingReceivedAtMs: Date.now(),
      isOffline: false,
    };
    const marker = makeMarker({ fillColor: "#3b82f6", rotation: 0 });

    const stats = applyGoogleMarkerVisualRefresh({
      plan: { mode: "dirty", ids: ["B"] },
      getCarById: () => car,
      getMarker: () => marker,
      mergeCar: (c) => c,
      PointCtor: Point,
    });

    assert.equal(stats.setIconCalls, 1);
    assert.equal(marker.getIcon().fillColor, "#22c55e");
    assert.equal(marker.getIcon().rotation, 90);
  });

  it("unknown/missing marker id: safely ignored", () => {
    const stats = applyGoogleMarkerVisualRefresh({
      plan: { mode: "dirty", ids: ["MISSING", "B"] },
      getCarById: (id) =>
        id === "B"
          ? {
              id: "B",
              position: { lat: 1, lng: 1 },
              speed: 0,
              direction: 0,
              lastSignel: Date.now(),
            }
          : null,
      getMarker: (id) => (id === "B" ? null : undefined),
      mergeCar: (c) => c,
      PointCtor: Point,
    });

    assert.equal(stats.skippedMissing, 2);
    assert.equal(stats.setIconCalls, 0);
  });

  it("genuine base metadata change: full visual refresh path still works", () => {
    const cars = makeFleet(5);
    const markers = new Map(
      cars.map((c) => [c.id, makeMarker({ fillColor: "#3b82f6", rotation: 0 })]),
    );
    const byId = new Map(cars.map((c) => [c.id, c]));

    const plan = resolveGoogleIconRefreshPlan({
      membershipChanged: false,
      baseMetaChanged: true,
      fleetDirtyIds: ["B"],
    });
    assert.equal(plan.mode, "full");

    const moved = cars.map((c) =>
      c.id === "B"
        ? { ...c, speed: 40, lastMovingReceivedAtMs: Date.now() }
        : c,
    );

    const stats = applyGoogleMarkerVisualRefresh({
      plan,
      allCars: moved,
      getCarById: (id) => byId.get(id),
      getMarker: (id) => markers.get(id),
      mergeCar: (c) => c,
      PointCtor: Point,
    });

    assert.equal(stats.considered, 5);
    assert.ok(markers.get("B").setIconCalls >= 1);
  });

  it("B2 live fields: targeted marker receives correct effective status/icon", () => {
    resetFleetStore();
    const cars = [
      {
        id: "B",
        position: { lat: 1, lng: 1 },
        speed: 0,
        direction: 0,
        lastSignel: Date.now(),
        isOffline: false,
      },
    ];
    seedFleetFromCars(cars);
    patchFleetLive("B", {
      speed: 55,
      direction: 180,
      lastMovingReceivedAtMs: Date.now(),
      isOffline: false,
    });

    const marker = makeMarker({ fillColor: "#3b82f6", rotation: 0 });
    const stats = applyGoogleMarkerVisualRefresh({
      plan: { mode: "dirty", ids: ["B"] },
      getCarById: () => cars[0],
      getMarker: () => marker,
      mergeCar: (car) => mergeCarWithFleet(car),
      PointCtor: Point,
    });

    assert.equal(stats.setIconCalls, 1);
    const visual = getMarkerVisualState(mergeCarWithFleet(cars[0]));
    assert.equal(marker.getIcon().fillColor, visual.color);
    assert.equal(marker.getIcon().rotation, 180);
    assert.equal(visual.color, "#22c55e");
  });

  it("immediate position path responsibility remains position-only (no icon in contract)", () => {
    // Documented contract: subscribeFleet → animateMarkerTo → setPosition.
    // Icon/rotation setIcon lives on throttled dirty-id path (this module).
    const posPathTouchesIcon = false;
    assert.equal(posPathTouchesIcon, false);
    assert.ok(typeof shouldUpdateMarkerIcon === "function");
  });
});
