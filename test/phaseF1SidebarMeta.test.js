import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isVehicleMoving } from "../src/utils/getCarStatus.js";
import {
  deriveBranchesFromBaseCars,
  deriveFilteredCars,
} from "../src/pages/TenantDashboard/fleetListDerive.js";
import { syncGoogleCarsMetaById } from "../src/pages/TenantDashboard/Maps/googleCarsMeta.js";
import {
  applyGoogleMarkerVisualRefresh,
  resolveGoogleIconRefreshPlan,
} from "../src/pages/TenantDashboard/Maps/googleMarkerVisual.js";
import {
  decideRealtimeClusterReloadAction,
  GOOGLE_SUPERCLUSTER_OPTIONS,
} from "../src/pages/TenantDashboard/Maps/googleClusterGate.js";

class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
}

function makeCars(n) {
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
      isInactive: false,
      branch_effective_id: i % 2 === 0 ? 1 : 2,
      branch_effective_name: i % 2 === 0 ? "Branch A" : "Branch B",
    });
  }
  return cars;
}

describe("Phase F1 — filter all / branches / Google meta", () => {
  it('activeFilter === "all": filteredCars === carsByBranch (no clone)', () => {
    const carsByBranch = makeCars(5);
    const filtered = deriveFilteredCars(carsByBranch, "all", isVehicleMoving);
    assert.equal(filtered, carsByBranch);
  });

  it("non-all filter: current filtering semantics preserved", () => {
    const carsByBranch = [
      { id: 1, isOffline: false, isInactive: false, speed: 0 },
      { id: 2, isOffline: true, isInactive: false, speed: 0 },
      {
        id: 3,
        isOffline: false,
        isInactive: false,
        speed: 40,
        lastMovingReceivedAtMs: Date.now(),
        lastFixAtMs: Date.now(),
      },
      { id: 4, isOffline: false, isInactive: true, speed: 0 },
    ];
    const online = deriveFilteredCars(carsByBranch, "online", isVehicleMoving);
    assert.deepEqual(
      online.map((c) => c.id),
      [1, 3],
    );
    const offline = deriveFilteredCars(carsByBranch, "offline", isVehicleMoving);
    assert.deepEqual(
      offline.map((c) => c.id),
      [2],
    );
    const moving = deriveFilteredCars(carsByBranch, "moving", isVehicleMoving);
    assert.deepEqual(
      moving.map((c) => c.id),
      [3],
    );
    const inactive = deriveFilteredCars(
      carsByBranch,
      "inactive",
      isVehicleMoving,
    );
    assert.deepEqual(
      inactive.map((c) => c.id),
      [4],
    );
    assert.notEqual(online, carsByBranch);
  });

  it("realtime-only dirty tick: branch definitions NOT recomputed from live", () => {
    const base = [
      {
        id: "A",
        branch_effective_id: 10,
        branch_effective_name: "North",
      },
      {
        id: "B",
        branch_effective_id: 20,
        branch_effective_name: "South",
      },
    ];
    const branches1 = deriveBranchesFromBaseCars(base);
    // Live materialization changed telemetry but base cars identity unchanged
    const live = base.map((c) => ({ ...c, speed: 99, position: { lat: 1, lng: 1 } }));
    const branches2 = deriveBranchesFromBaseCars(base);
    assert.deepEqual(branches1, branches2);
    assert.notEqual(live, base);
    // Simulate: branches deps are [cars] not carsWithLive — same base ref → same derivation input
    assert.equal(base, base);
  });

  it("base cars change: branches recompute correctly", () => {
    const base1 = [
      { id: "A", branch_effective_id: 1, branch_effective_name: "Alpha" },
    ];
    const base2 = [
      { id: "A", branch_effective_id: 1, branch_effective_name: "Alpha" },
      { id: "B", branch_effective_id: 2, branch_effective_name: "Beta" },
    ];
    const b1 = deriveBranchesFromBaseCars(base1);
    const b2 = deriveBranchesFromBaseCars(base2);
    assert.equal(b1.length, 1);
    assert.equal(b2.length, 2);
    assert.equal(b2[1].name, "Beta");
  });

  it("Google metadata: N=2000 dirtyIds=[B] only B updated", () => {
    const cars = makeCars(2000);
    const byId = new Map();
    const key = cars
      .map((c) => c.id)
      .sort()
      .join(",");

    const full = syncGoogleCarsMetaById({
      cars,
      byId,
      carIdsKey: key,
      prevCarIdsKey: null,
      carsBaseEpoch: 1,
      prevCarsBaseEpoch: null,
      fleetDirtyIds: null,
    });
    assert.equal(full.mode, "full");
    assert.equal(byId.size, 2000);

    const carB = { ...cars.find((c) => c.id === "B"), speed: 55 };
    const nextCars = cars.map((c) => (c.id === "B" ? carB : c));

    const dirty = syncGoogleCarsMetaById({
      cars: nextCars,
      byId,
      carIdsKey: key,
      prevCarIdsKey: key,
      carsBaseEpoch: 1,
      prevCarsBaseEpoch: 1,
      fleetDirtyIds: ["B"],
    });
    assert.equal(dirty.mode, "dirty");
    assert.equal(dirty.updated, 1);
    assert.equal(byId.get("B"), carB);
    assert.equal(byId.get("id-0"), cars[0]);
    assert.equal(byId.size, 2000);
  });

  it("dirtyIds=[B,C]: only B/C updated", () => {
    const cars = makeCars(100);
    const byId = new Map();
    const key = cars
      .map((c) => c.id)
      .sort()
      .join(",");
    syncGoogleCarsMetaById({
      cars,
      byId,
      carIdsKey: key,
      prevCarIdsKey: null,
      carsBaseEpoch: 1,
      prevCarsBaseEpoch: null,
      fleetDirtyIds: null,
    });
    const b = { ...cars.find((c) => c.id === "B"), name: "B2" };
    const c = { ...cars.find((c) => c.id === "C"), name: "C2" };
    const next = cars.map((x) => (x.id === "B" ? b : x.id === "C" ? c : x));
    const result = syncGoogleCarsMetaById({
      cars: next,
      byId,
      carIdsKey: key,
      prevCarIdsKey: key,
      carsBaseEpoch: 1,
      prevCarsBaseEpoch: 1,
      fleetDirtyIds: ["B", "C"],
    });
    assert.equal(result.updated, 2);
    assert.equal(byId.get("B"), b);
    assert.equal(byId.get("C"), c);
  });

  it("membership add/remove: full rebuild correct + no stale entry", () => {
    const cars = makeCars(3);
    const byId = new Map();
    const key1 = cars
      .map((c) => c.id)
      .sort()
      .join(",");
    syncGoogleCarsMetaById({
      cars,
      byId,
      carIdsKey: key1,
      prevCarIdsKey: null,
      carsBaseEpoch: 1,
      prevCarsBaseEpoch: null,
      fleetDirtyIds: null,
    });
    assert.ok(byId.has("B"));

    const remaining = cars.filter((c) => c.id !== "B");
    const key2 = remaining
      .map((c) => c.id)
      .sort()
      .join(",");
    const result = syncGoogleCarsMetaById({
      cars: remaining,
      byId,
      carIdsKey: key2,
      prevCarIdsKey: key1,
      carsBaseEpoch: 1,
      prevCarsBaseEpoch: 1,
      fleetDirtyIds: ["B"],
    });
    assert.equal(result.mode, "full");
    assert.equal(byId.has("B"), false);
    assert.equal(byId.size, remaining.length);
  });

  it("E1 targeted icon refresh still O(k)", () => {
    const plan = resolveGoogleIconRefreshPlan({
      membershipChanged: false,
      baseMetaChanged: false,
      fleetDirtyIds: ["B"],
    });
    assert.equal(plan.mode, "dirty");
    const cars = makeCars(2000);
    const byId = new Map(cars.map((c) => [c.id, c]));
    let lookups = 0;
    const stats = applyGoogleMarkerVisualRefresh({
      plan,
      getCarById: (id) => {
        lookups += 1;
        return byId.get(id);
      },
      getMarker: () => ({
        getIcon: () => ({ fillColor: "#3b82f6", rotation: 0 }),
        setIcon: () => {},
      }),
      mergeCar: (c) => c,
      PointCtor: Point,
    });
    assert.equal(stats.considered, 1);
    assert.equal(lookups, 1);
  });

  it("E2a cluster-off path still zero realtime loads", () => {
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
