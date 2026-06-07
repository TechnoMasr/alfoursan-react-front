/**
 * In-memory live tracking state for large fleets.
 * Avoids full React state updates on every GPS packet.
 */

const positionsById = new Map();
const serialToId = new Map();
let version = 0;
const listeners = new Set();
const listListeners = new Set();
let listNotifyTimer = null;

/** Throttle sidebar/list re-renders; maps subscribe via subscribeFleet (immediate). */
export const FLEET_LIST_THROTTLE_MS = 800;

function notifyListListeners() {
  if (listNotifyTimer) return;
  listNotifyTimer = setTimeout(() => {
    listNotifyTimer = null;
    const v = version;
    listListeners.forEach((fn) => {
      try {
        fn(v);
      } catch {
        /* ignore */
      }
    });
  }, FLEET_LIST_THROTTLE_MS);
}

function bump(change = null) {
  version += 1;
  listeners.forEach((fn) => {
    try {
      fn(version, change);
    } catch {
      /* ignore */
    }
  });
  if (listListeners.size > 0) notifyListListeners();
}

export function getFleetVersion() {
  return version;
}

export function subscribeFleet(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Coalesced updates for fleet lists / side menu (not map markers). */
export function subscribeFleetList(listener) {
  listListeners.add(listener);
  return () => listListeners.delete(listener);
}

export function resetFleetStore() {
  positionsById.clear();
  serialToId.clear();
  bump();
}

export function initFleetFromCars(cars) {
  if (!Array.isArray(cars)) return;
  let changed = false;
  cars.forEach((car) => {
    if (car?.id == null) return;
    if (car.serial_number) serialToId.set(String(car.serial_number), car.id);
    const prev = positionsById.get(car.id);
    const next = extractLiveFields(car);
    if (!prev || JSON.stringify(prev) !== JSON.stringify(next)) {
      positionsById.set(car.id, next);
      changed = true;
    }
  });
  if (changed) bump();
}

export function getFleetLive(deviceId) {
  return positionsById.get(deviceId) ?? null;
}

export function getDeviceIdBySerial(serial) {
  if (!serial) return null;
  return serialToId.get(String(serial)) ?? null;
}

export function patchFleetLive(deviceId, patch) {
  if (deviceId == null) return false;
  const prev = positionsById.get(deviceId) || {};
  const changed = Object.keys(patch || {}).some((key) => {
    const prevValue = prev[key];
    const nextValue = patch[key];
    if (key === "position") {
      return (
        prevValue?.lat !== nextValue?.lat ||
        prevValue?.lng !== nextValue?.lng
      );
    }
    return prevValue !== nextValue;
  });
  if (!changed) return false;

  const next = { ...prev, ...patch };
  positionsById.set(deviceId, next);
  if (patch.serial_number) serialToId.set(String(patch.serial_number), deviceId);
  bump({ deviceId, patch, prev, next });
  return true;
}

export function mergeCarWithFleet(car) {
  if (!car?.id) return car;
  const live = positionsById.get(car.id);
  if (!live) return car;
  return {
    ...car,
    ...live,
    position: live.position ?? car.position,
  };
}

export function mergeCarsWithFleet(cars) {
  if (!Array.isArray(cars)) return [];
  return cars.map(mergeCarWithFleet);
}

function extractLiveFields(car) {
  return {
    position: car.position ?? null,
    speed: car.speed,
    direction: car.direction,
    status: car.status,
    ignition_on: car.ignition_on,
    motion: car.motion,
    charge: car.charge,
    power: car.power,
    battery: car.battery,
    batteryLevel: car.batteryLevel,
    lastUpdate: car.lastUpdate,
    lastSignel: car.lastSignel,
    lastSignelGPS: car.lastSignelGPS,
    lastGpsAtMs: car.lastGpsAtMs,
    lastPacketMs: car.lastPacketMs,
    isOffline: car.isOffline,
    isInactive: car.isInactive,
    serial_number: car.serial_number,
  };
}
