import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGpsWebSocketSession } from "../src/utils/wsReconnect.js";
import {
  resetFleetStore,
  seedFleetFromCars,
  patchFleetLive,
  getFleetLive,
  subscribeFleet,
  getFleetFullArrayReplaceCount,
  mergeCarsWithFleet,
} from "../src/utils/fleetPositionStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(__dirname, "../src");

function mockSocketFactory(sockets) {
  return class MockWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.sent = [];
      this.closed = false;
      sockets.push(this);
      queueMicrotask(() => {
        if (this.closed) return;
        this.readyState = 1;
        this.onopen?.();
      });
    }
    send(raw) {
      this.sent.push(JSON.parse(raw));
    }
    close() {
      this.closed = true;
      this.readyState = 3;
      this.onclose?.({ code: 1000, reason: "close" });
    }
  };
}

describe("Phase A device vs tenant subscription", () => {
  it("device mode sends subscribe(imei) + command channel, not tenant room", () => {
    const sockets = [];
    const session = createGpsWebSocketSession({
      WebSocketImpl: mockSocketFactory(sockets),
      url: "wss://example.test/ws-backup/",
      useTenantRoom: false,
      getCars: () => [{ id: 1, serial_number: "865000111" }],
      commandChannel: "command_response_chanel",
    });
    session.connect();
    return Promise.resolve()
      .then(() => Promise.resolve())
      .then(() => {
        assert.equal(sockets.length, 1);
        const sent = sockets[0].sent;
        assert.ok(sent.some((m) => m.type === "subscribe_command_response_channel"));
        assert.ok(sent.some((m) => m.channel === "command_response_chanel"));
        assert.ok(sent.some((m) => m.type === "subscribe" && m.imei === "865000111"));
        assert.equal(
          sent.filter((m) => m.type === "subscribe_tenant_room").length,
          0,
        );
        session.destroy();
      });
  });

  it("tenant mode sends subscribe_tenant_room + command channel", () => {
    const sockets = [];
    const session = createGpsWebSocketSession({
      WebSocketImpl: mockSocketFactory(sockets),
      url: "wss://example.test/ws-backup/",
      useTenantRoom: true,
      getTenantRoom: () => "tenant:42",
      commandChannel: "command_response_chanel",
    });
    session.connect();
    return Promise.resolve()
      .then(() => Promise.resolve())
      .then(() => {
        const sent = sockets[0].sent;
        assert.ok(sent.some((m) => m.type === "subscribe_tenant_room" && m.room === "tenant:42"));
        assert.ok(sent.some((m) => m.type === "subscribe_command_response_channel"));
        assert.equal(sent.filter((m) => m.type === "subscribe").length, 0);
        session.destroy();
      });
  });

  it("device mode reconnect re-subscribes imei + command channel", () => {
    const sockets = [];
    let timers = [];
    const session = createGpsWebSocketSession({
      WebSocketImpl: mockSocketFactory(sockets),
      url: "wss://example.test/ws-backup/",
      useTenantRoom: false,
      getCars: () => [{ id: 9, serial_number: "999" }],
      setTimeoutFn: (fn) => {
        const id = { fn };
        timers.push(id);
        return id;
      },
      clearTimeoutFn: (id) => {
        timers = timers.filter((t) => t !== id);
      },
    });
    session.connect();
    return Promise.resolve()
      .then(() => Promise.resolve())
      .then(() => {
        const first = sockets[0];
        assert.ok(first.sent.some((m) => m.type === "subscribe" && m.imei === "999"));
        first.readyState = 3;
        first.onclose?.({ code: 1006, reason: "drop" });
        assert.equal(timers.length, 1);
        timers[0].fn();
        return Promise.resolve();
      })
      .then(() => Promise.resolve())
      .then(() => {
        const open = sockets[sockets.length - 1];
        assert.ok(open.sent.some((m) => m.type === "subscribe" && m.imei === "999"));
        assert.ok(open.sent.some((m) => m.type === "subscribe_command_response_channel"));
        assert.equal(open.sent.filter((m) => m.type === "subscribe_tenant_room").length, 0);
        session.destroy();
      });
  });
});

describe("Phase A page wiring (source)", () => {
  it("DeviceTracking and OutsideTracking force useTenantRoom: false", () => {
    const device = readFileSync(
      join(srcRoot, "pages/DeviceTracking/DeviceTracking.jsx"),
      "utf8",
    );
    const outside = readFileSync(
      join(srcRoot, "pages/OutsideTracking/OutsideTracking.jsx"),
      "utf8",
    );
    assert.match(device, /useTenantRoom:\s*false/);
    assert.match(outside, /useTenantRoom:\s*false/);
  });

  it("TenantDashboard does not force useTenantRoom false (tenant room via flag)", () => {
    const td = readFileSync(
      join(srcRoot, "pages/TenantDashboard/TenantDashboard.jsx"),
      "utf8",
    );
    assert.doesNotMatch(td, /useTenantRoom:\s*false/);
    assert.match(td, /useCarSocket\(/);
    assert.match(td, /useFleetStore:\s*true/);
  });

  it("OpenStreetMapView + MapLibre/MapTiler/Mapbox use targeted fleet updates (no React Marker fleet)", () => {
    const osm = readFileSync(
      join(srcRoot, "pages/TenantDashboard/Maps/OpenStreetMapView.jsx"),
      "utf8",
    );
    assert.match(osm, /subscribeFleet/);
    assert.match(osm, /change\?\.deviceId/);
    assert.match(osm, /marker\.setLatLng/);

    const subscribeBlock = osm.slice(osm.indexOf("subscribeFleet"));
    assert.doesNotMatch(subscribeBlock.slice(0, 1200), /setCars\s*\(/);
    assert.doesNotMatch(subscribeBlock.slice(0, 1200), /mergeCarsWithFleet/);

    for (const f of ["MapLibreMapView.jsx", "MapTilerMapView.jsx", "MapboxMapView.jsx"]) {
      const src = readFileSync(join(srcRoot, "pages/TenantDashboard/Maps", f), "utf8");
      assert.match(src, /useFleetGeoJsonSource/);
      assert.match(src, /FLEET_SOURCE_ID/);
      assert.match(src, /FLEET_CIRCLE_LAYER/);
      assert.doesNotMatch(src, /validCars\.map\s*\(/);
      assert.doesNotMatch(src, /\{cars\.map/);
    }

    const google = readFileSync(
      join(srcRoot, "pages/TenantDashboard/Maps/GoogleMapView.jsx"),
      "utf8",
    );
    assert.match(google, /subscribeFleet/);
  });
});

describe("Phase A fleet store targeted notify", () => {
  it("patchFleetLive notifies one deviceId without mergeCarsWithFleet", () => {
    resetFleetStore();
    seedFleetFromCars([
      { id: 1, serial_number: "1", position: { lat: 1, lng: 1 }, direction: 0 },
      { id: 2, serial_number: "2", position: { lat: 2, lng: 2 }, direction: 0 },
    ]);
    const beforeReplace = getFleetFullArrayReplaceCount();
    const seen = [];
    const unsub = subscribeFleet((_v, change) => {
      seen.push(change?.deviceId);
    });
    patchFleetLive(2, { position: { lat: 2.1, lng: 2.2 }, direction: 90 });
    unsub();
    assert.deepEqual(seen, [2]);
    assert.equal(getFleetLive(2).position.lat, 2.1);
    assert.equal(getFleetFullArrayReplaceCount(), beforeReplace);
    // prove mergeCarsWithFleet is the full-array path — not used by patch
    mergeCarsWithFleet([{ id: 1 }, { id: 2 }]);
    assert.equal(getFleetFullArrayReplaceCount(), beforeReplace + 1);
  });
});
