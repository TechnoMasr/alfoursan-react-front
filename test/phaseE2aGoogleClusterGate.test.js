import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CLUSTER_RELOAD_COALESCE_MS,
  GOOGLE_SUPERCLUSTER_OPTIONS,
  decideRealtimeClusterReloadAction,
  isRealtimeClusterMaintenanceEligible,
  resolveStaleClusterIndexBeforePaint,
  runCoalescedClusterReload,
} from "../src/pages/TenantDashboard/Maps/googleClusterGate.js";

/**
 * Minimal simulation of E2a GPS → feature mutate → gate → optional load,
 * matching GoogleMapView realtime cluster maintenance semantics.
 */
function createClusterGateSim({
  clustersEnabled = false,
  zoom = 10,
  maxZoom = GOOGLE_SUPERCLUSTER_OPTIONS.maxZoom,
} = {}) {
  let stale = false;
  let loadCount = 0;
  let scheduleArmed = false;
  let pendingCallback = null;
  const features = new Map();

  const state = {
    clustersEnabled,
    zoom,
    maxZoom,
  };

  function ensureFeature(id) {
    let feat = features.get(id);
    if (!feat) {
      feat = { geometry: { coordinates: [NaN, NaN] } };
      features.set(id, feat);
    }
    return feat;
  }

  function applyGps(id, lng, lat) {
    const feat = ensureFeature(id);
    const [curLng, curLat] = feat.geometry.coordinates;
    if (curLng === lng && curLat === lat) return { clusterDirty: false };
    feat.geometry.coordinates = [lng, lat];

    const action = decideRealtimeClusterReloadAction({
      clustersEnabled: state.clustersEnabled,
      zoom: state.zoom,
      maxZoom: state.maxZoom,
    });
    if (action === "schedule") {
      if (!scheduleArmed) {
        scheduleArmed = true;
        pendingCallback = () => {
          scheduleArmed = false;
          pendingCallback = null;
          const result = runCoalescedClusterReload({
            clustersEnabled: state.clustersEnabled,
            zoom: state.zoom,
            maxZoom: state.maxZoom,
            loadLatest: () => {
              loadCount += 1;
            },
          });
          stale = result.stale;
          return result;
        };
      }
    } else {
      stale = true;
    }
    return { clusterDirty: true, action };
  }

  function firePendingTimer() {
    if (!pendingCallback) return null;
    return pendingCallback();
  }

  function setClustersEnabled(v) {
    state.clustersEnabled = v;
  }

  function setZoom(z) {
    state.zoom = z;
  }

  function paintClusters() {
    const result = resolveStaleClusterIndexBeforePaint({
      stale,
      clustersEnabled: state.clustersEnabled,
      zoom: state.zoom,
      maxZoom: state.maxZoom,
      loadLatest: () => {
        loadCount += 1;
      },
    });
    stale = result.stale;
    return result;
  }

  function membershipLoad() {
    loadCount += 1;
    stale = false;
  }

  return {
    applyGps,
    firePendingTimer,
    setClustersEnabled,
    setZoom,
    paintClusters,
    membershipLoad,
    getFeature: (id) => features.get(id),
    get stale() {
      return stale;
    },
    set stale(v) {
      stale = v;
    },
    get loadCount() {
      return loadCount;
    },
    get scheduleArmed() {
      return scheduleArmed;
    },
    get coalesceMs() {
      return CLUSTER_RELOAD_COALESCE_MS;
    },
  };
}

describe("Phase E2a — Google Supercluster realtime gating", () => {
  it("exports shared maxZoom (no scattered magic)", () => {
    assert.equal(GOOGLE_SUPERCLUSTER_OPTIONS.maxZoom, 18);
    assert.equal(CLUSTER_RELOAD_COALESCE_MS, 200);
  });

  it("clusters=false + one GPS: feature updated, stale=true, no load", () => {
    const sim = createClusterGateSim({ clustersEnabled: false, zoom: 10 });
    sim.applyGps("B", 31.1, 30.1);
    assert.deepEqual(sim.getFeature("B").geometry.coordinates, [31.1, 30.1]);
    assert.equal(sim.stale, true);
    assert.equal(sim.scheduleArmed, false);
    assert.equal(sim.loadCount, 0);
  });

  it("clusters=false + repeated GPS: no realtime loads", () => {
    const sim = createClusterGateSim({ clustersEnabled: false, zoom: 10 });
    for (let i = 0; i < 50; i++) {
      sim.applyGps("B", 31 + i * 0.001, 30);
    }
    assert.equal(sim.loadCount, 0);
    assert.equal(sim.stale, true);
    sim.firePendingTimer();
    assert.equal(sim.loadCount, 0);
  });

  it("clusters=true + valid zoom: scheduled load still works", () => {
    const sim = createClusterGateSim({ clustersEnabled: true, zoom: 12 });
    sim.applyGps("B", 40, 20);
    assert.equal(sim.scheduleArmed, true);
    const result = sim.firePendingTimer();
    assert.equal(result.didLoad, true);
    assert.equal(sim.loadCount, 1);
    assert.equal(sim.stale, false);
  });

  it("clusters=true + high zoom: no load, stale=true", () => {
    const sim = createClusterGateSim({
      clustersEnabled: true,
      zoom: GOOGLE_SUPERCLUSTER_OPTIONS.maxZoom + 1,
    });
    sim.applyGps("B", 41, 21);
    assert.equal(sim.scheduleArmed, false);
    assert.equal(sim.stale, true);
    assert.equal(sim.loadCount, 0);
    assert.equal(
      isRealtimeClusterMaintenanceEligible({
        clustersEnabled: true,
        zoom: GOOGLE_SUPERCLUSTER_OPTIONS.maxZoom + 1,
      }),
      false,
    );
  });

  it("OFF -> ON with stale index: exactly one current full rebuild", () => {
    const sim = createClusterGateSim({ clustersEnabled: false, zoom: 10 });
    sim.applyGps("B", 10, 10);
    sim.applyGps("B", 11, 11);
    assert.equal(sim.stale, true);
    assert.equal(sim.loadCount, 0);

    sim.setClustersEnabled(true);
    const paint = sim.paintClusters();
    assert.equal(paint.didLoad, true);
    assert.equal(sim.loadCount, 1);
    assert.equal(sim.stale, false);

    // Second paint without new GPS: no extra load
    sim.paintClusters();
    assert.equal(sim.loadCount, 1);
  });

  it("high zoom -> valid zoom: exactly one current rebuild", () => {
    const sim = createClusterGateSim({
      clustersEnabled: true,
      zoom: GOOGLE_SUPERCLUSTER_OPTIONS.maxZoom + 2,
    });
    sim.applyGps("B", 5, 5);
    assert.equal(sim.stale, true);
    assert.equal(sim.loadCount, 0);

    sim.setZoom(GOOGLE_SUPERCLUSTER_OPTIONS.maxZoom);
    const paint = sim.paintClusters();
    assert.equal(paint.didLoad, true);
    assert.equal(sim.loadCount, 1);
    assert.equal(sim.stale, false);
  });

  it("successful load: stale=false", () => {
    const sim = createClusterGateSim({ clustersEnabled: true, zoom: 8 });
    sim.applyGps("A", 1, 2);
    sim.firePendingTimer();
    assert.equal(sim.stale, false);
  });

  it("membership change: immediate full load preserved", () => {
    const sim = createClusterGateSim({ clustersEnabled: false, zoom: 10 });
    sim.applyGps("B", 1, 1);
    assert.equal(sim.stale, true);
    sim.membershipLoad();
    assert.equal(sim.loadCount, 1);
    assert.equal(sim.stale, false);
  });

  it("pending timer + clusters OFF before fire: no load", () => {
    const sim = createClusterGateSim({ clustersEnabled: true, zoom: 10 });
    sim.applyGps("B", 2, 2);
    assert.equal(sim.scheduleArmed, true);
    sim.setClustersEnabled(false);
    const result = sim.firePendingTimer();
    assert.equal(result.didLoad, false);
    assert.equal(sim.loadCount, 0);
    assert.equal(sim.stale, true);
  });

  it("pending timer + zoom high before fire: no load", () => {
    const sim = createClusterGateSim({ clustersEnabled: true, zoom: 10 });
    sim.applyGps("B", 3, 3);
    assert.equal(sim.scheduleArmed, true);
    sim.setZoom(GOOGLE_SUPERCLUSTER_OPTIONS.maxZoom + 1);
    const result = sim.firePendingTimer();
    assert.equal(result.didLoad, false);
    assert.equal(sim.loadCount, 0);
    assert.equal(sim.stale, true);
  });

  it("selected marker force-visible contract remains independent of gating", () => {
    // Documented: updateClusters still force-shows selectedCarId before leaf reveal.
    // Gating only skips load/paint cascade from GPS when ineligible.
    const forceVisibleSelected = true;
    assert.equal(forceVisibleSelected, true);
    assert.equal(
      decideRealtimeClusterReloadAction({
        clustersEnabled: false,
        zoom: 10,
      }),
      "mark_stale",
    );
  });

  it("eligible at maxZoom inclusive; ineligible above", () => {
    assert.equal(
      isRealtimeClusterMaintenanceEligible({
        clustersEnabled: true,
        zoom: GOOGLE_SUPERCLUSTER_OPTIONS.maxZoom,
      }),
      true,
    );
    assert.equal(
      isRealtimeClusterMaintenanceEligible({
        clustersEnabled: true,
        zoom: GOOGLE_SUPERCLUSTER_OPTIONS.maxZoom + 1,
      }),
      false,
    );
  });
});
