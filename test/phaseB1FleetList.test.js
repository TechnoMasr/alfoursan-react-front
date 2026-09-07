import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  resetFleetStore,
  seedFleetFromCars,
  patchFleetLive,
  subscribeFleetList,
  subscribeFleet,
  materializeCarsWithFleet,
  mergeCarsWithFleet,
  getDirtyDeviceIdCount,
  getLastFlushedDirtyIds,
  flushFleetListNow,
  getFleetFullArrayReplaceCount,
  FLEET_LIST_THROTTLE_MS,
} from "../src/utils/fleetPositionStore.js";

function baseCars() {
  return [
    {
      id: "A",
      name: "Car A",
      serial_number: "100",
      position: { lat: 1, lng: 1 },
      speed: 0,
      direction: 0,
    },
    {
      id: "B",
      name: "Car B",
      serial_number: "200",
      position: { lat: 2, lng: 2 },
      speed: 0,
      direction: 0,
    },
    {
      id: "C",
      name: "Car C",
      serial_number: "300",
      position: { lat: 3, lng: 3 },
      speed: 0,
      direction: 0,
    },
  ];
}

describe("Phase B1 dirty-id referential-stable list", () => {
  beforeEach(() => {
    resetFleetStore();
  });

  it("GPS for B only rematerializes B; A and C keep object identity", () => {
    const cars = baseCars();
    seedFleetFromCars(cars);
    assert.equal(getDirtyDeviceIdCount(), 0);

    const { cars: prev } = materializeCarsWithFleet(cars, {
      baseCarsChanged: true,
    });
    assert.equal(prev.length, 3);

    const ok = patchFleetLive("B", {
      position: { lat: 2.5, lng: 2.5 },
      speed: 40,
      direction: 90,
    });
    assert.equal(ok, true);
    assert.equal(getDirtyDeviceIdCount(), 1);

    const dirty = [];
    const unsub = subscribeFleetList((_v, ids) => dirty.push(ids));
    flushFleetListNow();
    unsub();

    assert.deepEqual(dirty[0], ["B"]);
    assert.equal(getDirtyDeviceIdCount(), 0);

    const { cars: next, rematerializedCount, fullReplace } =
      materializeCarsWithFleet(cars, {
        prevMerged: prev,
        dirtyIds: dirty[0],
        baseCarsChanged: false,
      });

    assert.equal(fullReplace, false);
    assert.equal(rematerializedCount, 1);
    assert.equal(next[0], prev[0]); // A
    assert.notEqual(next[1], prev[1]); // B
    assert.equal(next[2], prev[2]); // C
    assert.equal(next[1].position.lat, 2.5);
    assert.equal(next[1].speed, 40);
  });

  it("second flush with no changes does not notify list", () => {
    const cars = baseCars();
    seedFleetFromCars(cars);
    patchFleetLive("B", { speed: 10 });
    let notifies = 0;
    const unsub = subscribeFleetList(() => {
      notifies += 1;
    });
    flushFleetListNow();
    assert.equal(notifies, 1);
    assert.equal(getDirtyDeviceIdCount(), 0);

    const flushed = flushFleetListNow();
    assert.equal(flushed, false);
    assert.equal(notifies, 1);

    // no-op patch
    const changed = patchFleetLive("B", { speed: 10 });
    assert.equal(changed, false);
    assert.equal(getDirtyDeviceIdCount(), 0);
    flushFleetListNow();
    assert.equal(notifies, 1);
    unsub();
  });

  it("rejected/no-op GPS does not dirty or rematerialize", () => {
    const cars = baseCars();
    seedFleetFromCars(cars);
    const { cars: prev } = materializeCarsWithFleet(cars, {
      baseCarsChanged: true,
    });
    const beforeReplace = getFleetFullArrayReplaceCount();

    // Effective change, then identical replay — second call must not dirty.
    assert.equal(
      patchFleetLive("B", { position: { lat: 2.1, lng: 2.1 }, speed: 40 }),
      true,
    );
    flushFleetListNow();
    assert.equal(getDirtyDeviceIdCount(), 0);
    assert.equal(
      patchFleetLive("B", { position: { lat: 2.1, lng: 2.1 }, speed: 40 }),
      false,
    );
    assert.equal(getDirtyDeviceIdCount(), 0);

    let notified = false;
    const unsub = subscribeFleetList(() => {
      notified = true;
    });
    flushFleetListNow();
    unsub();
    assert.equal(notified, false);

    const { cars: next, rematerializedCount } = materializeCarsWithFleet(cars, {
      prevMerged: prev,
      dirtyIds: [],
      baseCarsChanged: false,
    });
    assert.equal(rematerializedCount, 0);
    assert.equal(next, prev);
    assert.equal(next[0], prev[0]);
    assert.equal(next[1], prev[1]);
    assert.equal(next[2], prev[2]);
    assert.equal(getFleetFullArrayReplaceCount(), beforeReplace);
  });

  it("updates for B and C only change B and C refs", () => {
    const cars = baseCars();
    seedFleetFromCars(cars);
    const { cars: prev } = materializeCarsWithFleet(cars, {
      baseCarsChanged: true,
    });

    patchFleetLive("B", { speed: 20 });
    patchFleetLive("C", { speed: 30 });
    const flushed = [];
    const unsub = subscribeFleetList((_v, ids) => flushed.push(ids));
    flushFleetListNow();
    unsub();

    assert.equal(flushed[0].length, 2);
    assert.ok(flushed[0].includes("B"));
    assert.ok(flushed[0].includes("C"));

    const { cars: next, rematerializedCount } = materializeCarsWithFleet(cars, {
      prevMerged: prev,
      dirtyIds: flushed[0],
      baseCarsChanged: false,
    });
    assert.equal(rematerializedCount, 2);
    assert.equal(next[0], prev[0]);
    assert.notEqual(next[1], prev[1]);
    assert.notEqual(next[2], prev[2]);
  });

  it("base metadata change for A rematerializes via full merge without realtime dirty", () => {
    const cars = baseCars();
    seedFleetFromCars(cars);
    const { cars: prev } = materializeCarsWithFleet(cars, {
      baseCarsChanged: true,
    });

    assert.equal(getDirtyDeviceIdCount(), 0);
    const nextBase = cars.map((c) =>
      c.id === "A" ? { ...c, name: "Car A renamed" } : c,
    );

    const { cars: next, fullReplace } = materializeCarsWithFleet(nextBase, {
      prevMerged: prev,
      dirtyIds: null,
      baseCarsChanged: true,
    });
    assert.equal(fullReplace, true);
    assert.equal(next[0].name, "Car A renamed");
    assert.notEqual(next[0], prev[0]);
  });

  it("dirty ids are consumed/cleared on flush", () => {
    seedFleetFromCars(baseCars());
    patchFleetLive("A", { speed: 1 });
    patchFleetLive("B", { speed: 2 });
    assert.equal(getDirtyDeviceIdCount(), 2);
    flushFleetListNow();
    assert.equal(getDirtyDeviceIdCount(), 0);
    const last = getLastFlushedDirtyIds();
    assert.equal(last.length, 2);
  });

  it("update arriving during flush remains pending for next flush", () => {
    seedFleetFromCars(baseCars());
    patchFleetLive("A", { speed: 1 });

    let firstFlush = null;
    let secondFlush = null;
    let n = 0;
    const unsub = subscribeFleetList((_v, ids) => {
      n += 1;
      if (n === 1) {
        firstFlush = ids;
        // Simulate GPS for C arriving while list listeners run
        patchFleetLive("C", { speed: 99 });
      } else {
        secondFlush = ids;
      }
    });

    flushFleetListNow();
    assert.deepEqual(firstFlush, ["A"]);
    assert.equal(getDirtyDeviceIdCount(), 1);
    // scheduleListNotify was called; force second flush
    flushFleetListNow();
    assert.deepEqual(secondFlush, ["C"]);
    assert.equal(getDirtyDeviceIdCount(), 0);
    unsub();
  });

  it("seed does not mark dirty or schedule list notify", () => {
    let listNotifies = 0;
    const unsub = subscribeFleetList(() => {
      listNotifies += 1;
    });
    seedFleetFromCars(baseCars());
    assert.equal(getDirtyDeviceIdCount(), 0);
    flushFleetListNow();
    assert.equal(listNotifies, 0);
    unsub();
  });

  it("map subscribeFleet still fires immediately independent of list throttle", () => {
    seedFleetFromCars(baseCars());
    let mapHits = 0;
    const unsub = subscribeFleet(() => {
      mapHits += 1;
    });
    patchFleetLive("B", { position: { lat: 9, lng: 9 } });
    assert.equal(mapHits, 1);
    assert.equal(getDirtyDeviceIdCount(), 1);
    // list not flushed yet
    assert.ok(FLEET_LIST_THROTTLE_MS >= 800);
    unsub();
  });

  it("2000 cars + one GPS rematerializes ~1 object not ~2000", () => {
    const cars = [];
    for (let i = 0; i < 2000; i++) {
      cars.push({
        id: i + 1,
        name: `c${i}`,
        serial_number: String(i),
        position: { lat: i, lng: i },
        speed: 0,
      });
    }
    seedFleetFromCars(cars);
    const { cars: prev } = materializeCarsWithFleet(cars, {
      baseCarsChanged: true,
    });
    const fullCountAfterSeed = getFleetFullArrayReplaceCount();

    patchFleetLive(42, { position: { lat: 99, lng: 99 }, speed: 55 });
    const dirty = [];
    const unsub = subscribeFleetList((_v, ids) => dirty.push(ids));
    flushFleetListNow();
    unsub();

    const beforePartial = getFleetFullArrayReplaceCount();
    const { cars: next, rematerializedCount, fullReplace } =
      materializeCarsWithFleet(cars, {
        prevMerged: prev,
        dirtyIds: dirty[0],
        baseCarsChanged: false,
      });

    assert.equal(fullReplace, false);
    assert.equal(rematerializedCount, 1);
    assert.equal(getFleetFullArrayReplaceCount(), beforePartial);
    assert.equal(getFleetFullArrayReplaceCount(), fullCountAfterSeed);

    let same = 0;
    let different = 0;
    for (let i = 0; i < 2000; i++) {
      if (next[i] === prev[i]) same += 1;
      else different += 1;
    }
    assert.equal(different, 1);
    assert.equal(same, 1999);
    assert.equal(next[41].speed, 55);
  });

  it("mergeCarsWithFleet still available for full base rematerialize", () => {
    seedFleetFromCars(baseCars());
    const a = mergeCarsWithFleet(baseCars());
    const b = mergeCarsWithFleet(baseCars());
    assert.notEqual(a[0], b[0]);
  });
});
