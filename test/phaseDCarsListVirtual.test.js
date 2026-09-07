import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Virtualizer } from "@tanstack/virtual-core";
import {
  CAR_LIST_OVERSCAN,
  CAR_LIST_ROW_STRIDE_PX,
  findSelectedCarIndex,
} from "../src/pages/TenantDashboard/SideMenu/sections/carsListVirtualConfig.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, "../src");

function makeScrollElement({ height = 600, scrollTop = 0 } = {}) {
  const el = {
    clientHeight: height,
    clientWidth: 400,
    scrollTop,
    scrollLeft: 0,
    scrollHeight: 2000 * CAR_LIST_ROW_STRIDE_PX,
    offsetHeight: height,
    offsetWidth: 400,
    getBoundingClientRect: () => ({
      width: 400,
      height,
      top: 0,
      left: 0,
      bottom: height,
      right: 400,
      x: 0,
      y: 0,
    }),
    addEventListener() {},
    removeEventListener() {},
  };
  return el;
}

function createListVirtualizer({ count, scrollTop = 0, height = 600 }) {
  const el = makeScrollElement({ height, scrollTop });
  const virtualizer = new Virtualizer({
    count,
    getScrollElement: () => el,
    estimateSize: () => CAR_LIST_ROW_STRIDE_PX,
    overscan: CAR_LIST_OVERSCAN,
    getItemKey: (index) => `id-${index + 1}`,
    observeElementRect: (_instance, cb) => {
      cb({ width: 400, height });
      return () => {};
    },
    observeElementOffset: (_instance, cb) => {
      cb(scrollTop, false);
      return () => {};
    },
    scrollToFn: (offset) => {
      el.scrollTop = offset;
    },
  });
  virtualizer._willUpdate();
  return { virtualizer, el };
}

describe("Phase D CarsList virtualization", () => {
  it("uses fixed stride including former gap and overscan 10", () => {
    assert.equal(CAR_LIST_ROW_STRIDE_PX, 48);
    assert.equal(CAR_LIST_OVERSCAN, 10);
    assert.ok(CAR_LIST_ROW_STRIDE_PX >= 44 && CAR_LIST_ROW_STRIDE_PX <= 52);
  });

  it("CarsList source uses useVirtualizer and does not full-map cars", () => {
    const src = readFileSync(
      join(srcRoot, "pages/TenantDashboard/SideMenu/sections/CarsList.jsx"),
      "utf8",
    );
    assert.match(src, /useVirtualizer/);
    assert.match(src, /@tanstack\/react-virtual/);
    assert.match(src, /getVirtualItems/);
    assert.match(src, /scrollToIndex/);
    assert.doesNotMatch(src, /scrollIntoView/);
    assert.doesNotMatch(src, /cars\.map\s*\(/);
    assert.match(src, /getItemKey/);
    assert.match(src, /CAR_LIST_OVERSCAN/);
  });

  it("2000-item list mounts bounded virtual rows << total", () => {
    const { virtualizer } = createListVirtualizer({ count: 2000, height: 600 });
    const items = virtualizer.getVirtualItems();
    assert.ok(items.length > 0);
    assert.ok(
      items.length < 100,
      `expected <100 mounted rows, got ${items.length}`,
    );
    assert.equal(virtualizer.options.count, 2000);
    assert.equal(items[0].index, 0);
  });

  it("10000-item list still mounts bounded rows", () => {
    const { virtualizer } = createListVirtualizer({ count: 10000, height: 600 });
    const items = virtualizer.getVirtualItems();
    assert.ok(items.length < 100);
    assert.equal(virtualizer.getTotalSize(), 10000 * CAR_LIST_ROW_STRIDE_PX);
  });

  it("scrolling exposes later vehicles", () => {
    const scrollTop = 500 * CAR_LIST_ROW_STRIDE_PX;
    const { virtualizer } = createListVirtualizer({
      count: 2000,
      height: 600,
      scrollTop,
    });
    const items = virtualizer.getVirtualItems();
    assert.ok(items[0].index >= 480);
    assert.ok(items.some((i) => i.index >= 500));
  });

  it("findSelectedCarIndex supports scrollToIndex and filtered-out no-op", () => {
    const cars = [
      { id: "A" },
      { id: "B" },
      { id: "C" },
    ];
    assert.equal(findSelectedCarIndex(cars, "B"), 1);
    assert.equal(findSelectedCarIndex(cars, "Z"), -1);
    assert.equal(findSelectedCarIndex([], "A"), -1);
    assert.equal(findSelectedCarIndex(cars, null), -1);

    const { virtualizer } = createListVirtualizer({ count: 3, height: 600 });
    const idx = findSelectedCarIndex(cars, "C");
    assert.equal(idx, 2);
    virtualizer.scrollToIndex(idx, { align: "auto" });
  });

  it("filter count change updates virtualizer total size", () => {
    const { virtualizer, el } = createListVirtualizer({ count: 2000 });
    assert.equal(virtualizer.getTotalSize(), 2000 * CAR_LIST_ROW_STRIDE_PX);
    virtualizer.setOptions({
      ...virtualizer.options,
      count: 50,
      getScrollElement: () => el,
    });
    virtualizer._willUpdate();
    assert.equal(virtualizer.getTotalSize(), 50 * CAR_LIST_ROW_STRIDE_PX);
  });

  it("empty list has zero virtual items / no total size pressure", () => {
    const { virtualizer } = createListVirtualizer({ count: 0 });
    assert.equal(virtualizer.getVirtualItems().length, 0);
    assert.equal(virtualizer.getTotalSize(), 0);
  });

  it("getItemKey uses durable car.id not array index as identity", () => {
    const cars = Array.from({ length: 20 }, (_, i) => ({ id: `car-${i}` }));
    const keyFn = (index) => cars[index]?.id ?? index;
    assert.equal(keyFn(5), "car-5");
    assert.notEqual(keyFn(5), 5);

    const src = readFileSync(
      join(srcRoot, "pages/TenantDashboard/SideMenu/sections/CarsList.jsx"),
      "utf8",
    );
    assert.match(src, /carsRef\.current\?\.\[index\]\?\.id/);
  });

  it("CarRow memo and handleSelectCar API unchanged (no redesign)", () => {
    const src = readFileSync(
      join(srcRoot, "pages/TenantDashboard/SideMenu/sections/CarsList.jsx"),
      "utf8",
    );
    assert.match(src, /const CarRow = memo\(/);
    assert.match(src, /handleSelectCar\(car, true\)/);
    assert.match(src, /data-car-id=\{car\.id\}/);
  });
});
