import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { heartbeatVoltageToPowerPatch } from "../src/utils/deviceTelemetry.js";
import { applyGpsPacketToCar } from "../src/utils/gpsPacketReducer.js";
import {
  resetFleetStore,
  seedFleetFromCars,
  patchFleetLive,
  getFleetLive,
  materializeCarsWithFleet,
  flushFleetListNow,
  getDirtyDeviceIdCount,
  subscribeFleetList,
} from "../src/utils/fleetPositionStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, "../src");

function baseCars() {
  return [
    {
      id: "A",
      name: "Car A",
      serial_number: "100",
      position: { lat: 1, lng: 1 },
      speed: 0,
      isOffline: false,
    },
    {
      id: "B",
      name: "Car B",
      serial_number: "200",
      position: { lat: 2, lng: 2 },
      speed: 0,
      isOffline: false,
    },
    {
      id: "C",
      name: "Car C",
      serial_number: "300",
      position: { lat: 3, lng: 3 },
      speed: 0,
      isOffline: false,
    },
  ];
}

function gpsData({ imei = "200", lat = 2.5, lng = 2.5, speed = 40, packetMs }) {
  const t = packetMs || Date.parse("2026-08-19T12:00:00.000Z");
  return {
    type: "gps",
    data: {
      imei,
      latitude: lat,
      longitude: lng,
      speed,
      direction: 90,
      packet_date: new Date(t).toISOString(),
      date: new Date(t).toISOString(),
    },
  };
}

describe("Phase B2 voltage/power mapping", () => {
  it("heartbeat externalVoltage maps to power for CarRow (not unused voltage)", () => {
    assert.deepEqual(heartbeatVoltageToPowerPatch(12.6), { power: 12.6 });
    assert.equal(heartbeatVoltageToPowerPatch(null), null);
    assert.equal(heartbeatVoltageToPowerPatch(""), null);

    const carRowSrc = readFileSync(
      join(srcRoot, "pages/TenantDashboard/SideMenu/sections/CarsList.jsx"),
      "utf8",
    );
    assert.match(carRowSrc, /car\?\.power/);
    assert.doesNotMatch(carRowSrc, /car\?\.voltage/);

    const hookSrc = readFileSync(join(srcRoot, "hooks/useCarSocket.jsx"), "utf8");
    assert.match(hookSrc, /heartbeatVoltageToPowerPatch/);
    // Legacy non-fleet path still writes voltage
    assert.match(hookSrc, /voltage:\s*externalVoltage/);
  });
});

describe("Phase B2 GPS fleet vs single-device", () => {
  it("source: fleet mode GPS skips setCars; single-device path retains setCars", () => {
    const hookSrc = readFileSync(join(srcRoot, "hooks/useCarSocket.jsx"), "utf8");
    assert.match(
      hookSrc,
      /useFleetStore && !updateCarsOnGps[\s\S]*?applyGpsForCar\(existing\);\s*return;/,
    );
    assert.match(hookSrc, /Single-device \/ non-fleet pages[\s\S]*?setCars\(/);

    const device = readFileSync(
      join(srcRoot, "pages/DeviceTracking/DeviceTracking.jsx"),
      "utf8",
    );
    const outside = readFileSync(
      join(srcRoot, "pages/OutsideTracking/OutsideTracking.jsx"),
      "utf8",
    );
    assert.doesNotMatch(device, /useFleetStore:\s*true/);
    assert.doesNotMatch(outside, /useFleetStore:\s*true/);
    assert.doesNotMatch(device, /updateCarsOnGps:\s*false/);
    assert.doesNotMatch(outside, /updateCarsOnGps:\s*false/);

    const td = readFileSync(
      join(srcRoot, "pages/TenantDashboard/TenantDashboard.jsx"),
      "utf8",
    );
    assert.match(td, /useFleetStore:\s*true/);
    assert.match(td, /updateCarsOnGps:\s*false/);
  });

  it("fleet-style GPS patches store without needing React cars identity change", () => {
    resetFleetStore();
    const cars = baseCars();
    seedFleetFromCars(cars);
    const { cars: prev } = materializeCarsWithFleet(cars, {
      baseCarsChanged: true,
    });

    const existing = cars[1];
    const live = getFleetLive(existing.id);
    const base = { ...existing, ...live, position: live.position };
    const result = applyGpsPacketToCar(base, gpsData({}), {
      nowMs: Date.parse("2026-08-19T12:00:00.000Z"),
    });
    assert.equal(result.skipped, false);
    patchFleetLive(
      existing.id,
      {
        position: result.car.position,
        speed: result.car.speed,
        direction: result.car.direction,
        lastPacketMs: result.car.lastPacketMs,
        lastFixAtMs: result.car.lastFixAtMs,
      },
      { visualChanged: result.visualChanged },
    );

    const dirty = [];
    const unsub = subscribeFleetList((_v, ids) => dirty.push(ids));
    flushFleetListNow();
    unsub();

    const { cars: next, rematerializedCount } = materializeCarsWithFleet(cars, {
      prevMerged: prev,
      dirtyIds: dirty[0],
      baseCarsChanged: false,
    });
    assert.equal(rematerializedCount, 1);
    assert.equal(next[0], prev[0]);
    assert.notEqual(next[1], prev[1]);
    assert.equal(next[2], prev[2]);
    // Base React cars array identity unchanged by this path
    assert.equal(cars[1], existing);
  });
});

describe("Phase B2 heartbeat / device / alarm store patches", () => {
  beforeEach(() => resetFleetStore());

  it("heartbeat for B rematerializes only B; identical heartbeat does not dirty", () => {
    const cars = baseCars();
    seedFleetFromCars(cars);
    const { cars: prev } = materializeCarsWithFleet(cars, {
      baseCarsChanged: true,
    });

    const patch = heartbeatVoltageToPowerPatch(13.1);
    assert.ok(patchFleetLive("B", patch, { visualChanged: false }));
    const dirty = [];
    subscribeFleetList((_v, ids) => dirty.push(ids));
    flushFleetListNow();
    assert.deepEqual(dirty[0], ["B"]);

    const { cars: next } = materializeCarsWithFleet(cars, {
      prevMerged: prev,
      dirtyIds: dirty[0],
      baseCarsChanged: false,
    });
    assert.equal(next[0], prev[0]);
    assert.notEqual(next[1], prev[1]);
    assert.equal(next[2], prev[2]);
    assert.equal(next[1].power, 13.1);

    assert.equal(patchFleetLive("B", patch, { visualChanged: false }), false);
    assert.equal(getDirtyDeviceIdCount(), 0);
  });

  it("device online→offline changes only target row; same status twice is no-op", () => {
    const cars = baseCars();
    seedFleetFromCars(cars);
    const { cars: prev } = materializeCarsWithFleet(cars, {
      baseCarsChanged: true,
    });

    assert.ok(
      patchFleetLive(
        "B",
        { isOffline: true, isInactive: false },
        { visualChanged: false },
      ),
    );
    const dirty = [];
    const unsub = subscribeFleetList((_v, ids) => dirty.push(ids));
    flushFleetListNow();
    unsub();

    const { cars: next } = materializeCarsWithFleet(cars, {
      prevMerged: prev,
      dirtyIds: dirty[0],
      baseCarsChanged: false,
    });
    assert.equal(next[0], prev[0]);
    assert.notEqual(next[1], prev[1]);
    assert.equal(next[2], prev[2]);
    assert.equal(next[1].isOffline, true);

    assert.equal(
      patchFleetLive(
        "B",
        { isOffline: true, isInactive: false },
        { visualChanged: false },
      ),
      false,
    );
    assert.equal(getDirtyDeviceIdCount(), 0);
  });

  it("alarm live attrs for B only change B; pool helper remains importable", () => {
    const cars = baseCars();
    seedFleetFromCars(cars);
    const { cars: prev } = materializeCarsWithFleet(cars, {
      baseCarsChanged: true,
    });

    assert.ok(
      patchFleetLive(
        "B",
        { ignition_on: true, motion: true, charge: true },
        { visualChanged: false },
      ),
    );
    const dirty = [];
    const unsub = subscribeFleetList((_v, ids) => dirty.push(ids));
    flushFleetListNow();
    unsub();

    const { cars: next, rematerializedCount } = materializeCarsWithFleet(cars, {
      prevMerged: prev,
      dirtyIds: dirty[0],
      baseCarsChanged: false,
    });
    assert.equal(rematerializedCount, 1);
    assert.equal(next[0], prev[0]);
    assert.equal(next[2], prev[2]);
    assert.equal(next[1].ignition_on, true);

    const poolSrc = readFileSync(join(srcRoot, "utils/alarmPool.js"), "utf8");
    assert.match(poolSrc, /export function pushAlarmEntry|export const pushAlarmEntry/);
    const hookSrc = readFileSync(join(srcRoot, "hooks/useCarSocket.jsx"), "utf8");
    assert.match(hookSrc, /pushAlarmEntry\(/);
    assert.match(hookSrc, /toast\.custom/);
  });
});

describe("Phase B2 command + bootstrap source guards", () => {
  it("command_response still uses Redux setCommandResponse without setCars", () => {
    const hookSrc = readFileSync(join(srcRoot, "hooks/useCarSocket.jsx"), "utf8");
    const cmdIdx = hookSrc.indexOf('data.type === "command_response"');
    assert.ok(cmdIdx > 0);
    const cmdBlock = hookSrc.slice(cmdIdx, cmdIdx + 1200);
    assert.match(cmdBlock, /setCommandResponse/);
    assert.doesNotMatch(cmdBlock, /setCars\(/);
  });

  it("full bootstrap remains single full=true query", () => {
    const td = readFileSync(
      join(srcRoot, "pages/TenantDashboard/TenantDashboard.jsx"),
      "utf8",
    );
    assert.match(td, /full:\s*true/);
    assert.doesNotMatch(td, /refetchFullDevices/);
    assert.doesNotMatch(td, /full:\s*false/);
  });
});
