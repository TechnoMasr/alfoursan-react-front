import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resetFleetStore,
  seedFleetFromCars,
  patchFleetLive,
  getFleetLive,
  materializeCarsWithFleet,
  flushFleetListNow,
  getDirtyDeviceIdCount,
} from "../src/utils/fleetPositionStore.js";
import { mergeCarsPreferLive } from "../src/utils/mergeFleetSnapshot.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tdPath = join(
  __dirname,
  "../src/pages/TenantDashboard/TenantDashboard.jsx",
);
const servicesPath = join(__dirname, "../src/services/monitorServices.js");

describe("Single full initial fleet load", () => {
  it("TenantDashboard requests devices with full:true only once (no partial then full)", () => {
    const src = readFileSync(tdPath, "utf8");
    assert.match(src, /queryKey:\s*\[\s*"devices"\s*,\s*\{\s*full:\s*true\s*\}\s*\]/);
    assert.doesNotMatch(src, /full:\s*false/);
    assert.doesNotMatch(src, /refetchFullDevices/);
    assert.equal((src.match(/useQuery\(/g) || []).length, 1);
  });

  it("getDevices uses ?full=1 when full truthy", () => {
    const src = readFileSync(servicesPath, "utf8");
    assert.match(src, /\/data\$\{full \? "\?full=1" : ""\}/);
  });

  it("full HTTP snapshot seeds base fleet once without second stage merge", () => {
    resetFleetStore();
    const mapped = [
      {
        id: 1,
        serial_number: "111",
        name: "A",
        position: { lat: 1, lng: 1 },
        speed: 0,
        lastPacketMs: 1000,
        lastFixAtMs: 1000,
      },
      {
        id: 2,
        serial_number: "222",
        name: "B",
        position: { lat: 2, lng: 2 },
        speed: 0,
        lastPacketMs: 1000,
        lastFixAtMs: 1000,
      },
    ];
    const next = mergeCarsPreferLive([], mapped);
    seedFleetFromCars(next);
    assert.equal(getDirtyDeviceIdCount(), 0);
    assert.ok(getFleetLive(1));
    assert.ok(getFleetLive(2));
    const { cars, fullReplace } = materializeCarsWithFleet(next, {
      baseCarsChanged: true,
    });
    assert.equal(fullReplace, true);
    assert.equal(cars.length, 2);
  });

  it("newer WS position beats older full HTTP snapshot in fleet store", () => {
    resetFleetStore();
    // WS arrived while request in flight
    seedFleetFromCars([
      {
        id: 9,
        serial_number: "999",
        position: { lat: 10, lng: 10 },
        speed: 0,
        lastPacketMs: 1000,
        lastFixAtMs: 1000,
      },
    ]);
    patchFleetLive(9, {
      position: { lat: 25, lng: 47 },
      speed: 50,
      lastPacketMs: 5000,
      lastFixAtMs: 5000,
    });
    flushFleetListNow();

    // Older full HTTP finishes
    const httpCars = [
      {
        id: 9,
        serial_number: "999",
        name: "from-api",
        position: { lat: 10, lng: 10 },
        speed: 0,
        lastPacketMs: 1000,
        lastFixAtMs: 1000,
      },
    ];
    const mergedReact = mergeCarsPreferLive(
      [
        {
          id: 9,
          serial_number: "999",
          position: { lat: 25, lng: 47 },
          speed: 50,
          lastPacketMs: 5000,
          lastFixAtMs: 5000,
        },
      ],
      httpCars,
    );
    seedFleetFromCars(mergedReact);

    const live = getFleetLive(9);
    assert.equal(live.position.lat, 25);
    assert.equal(live.speed, 50);
    assert.equal(mergedReact[0].position.lat, 25);
    assert.equal(mergedReact[0].name, "from-api");
  });
});
