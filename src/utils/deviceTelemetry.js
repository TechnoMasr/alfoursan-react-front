/** Parse numeric telemetry (V or %) from socket attributes or Mongo snapshot. */
export function parseTelemetryNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function pickSocketAttributes(data) {
  const d = data?.data ?? data;
  return (
    d?.attributes ??
    d?.traccar_raw?.attributes ??
    d?.legacy?.attributes ??
    {}
  );
}

export function telemetryFromAttributes(attrs) {
  if (!attrs || typeof attrs !== "object") return {};
  const out = {};
  const power = parseTelemetryNumber(attrs.power);
  const battery = parseTelemetryNumber(attrs.battery);
  const batteryLevel = parseTelemetryNumber(attrs.batteryLevel);
  if (power != null) out.power = power;
  if (battery != null) out.battery = battery;
  if (batteryLevel != null) out.batteryLevel = batteryLevel;
  return out;
}

/** Map devicestatuses Mongo fields to socket attribute names. */
export function telemetryFromMongo(st) {
  if (!st || typeof st !== "object") return {};
  const out = {};
  const power = parseTelemetryNumber(st.power_voltage ?? st.power);
  const battery = parseTelemetryNumber(st.battery_voltage ?? st.battery);
  const batteryLevel = parseTelemetryNumber(
    st.battery_level ?? st.batteryLevel,
  );
  if (power != null) out.power = power;
  if (battery != null) out.battery = battery;
  if (batteryLevel != null) out.batteryLevel = batteryLevel;
  return out;
}

/** True when patch explicitly carries a usable numeric value for key. */
function hasTelemetryValue(obj, key) {
  return (
    obj != null &&
    Object.prototype.hasOwnProperty.call(obj, key) &&
    parseTelemetryNumber(obj[key]) != null
  );
}

const TELEMETRY_KEYS = ["power", "battery", "batteryLevel"];

/**
 * Sticky merge: socket/API null or missing keys never clear last good values.
 */
export function mergeTelemetry(prev, incoming) {
  const p = prev || {};
  const n = incoming || {};
  const out = {};
  for (const key of TELEMETRY_KEYS) {
    if (hasTelemetryValue(n, key)) {
      out[key] = parseTelemetryNumber(n[key]);
    } else if (parseTelemetryNumber(p[key]) != null) {
      out[key] = parseTelemetryNumber(p[key]);
    } else {
      out[key] = null;
    }
  }
  return out;
}

/** Apply sticky telemetry onto a car/device object without wiping with null. */
export function withStickyTelemetry(car, patch) {
  if (!car) return car;
  return { ...car, ...mergeTelemetry(car, patch) };
}

/**
 * Heartbeat `externalVoltage` → UI field mapping (proven CURRENT consumers):
 * - useCarSocket historically wrote `voltage` on React cars
 * - CarsList/CarRow reads `power` via parseTelemetryNumber(car.power)
 * - GPS/Mongo telemetry already use `power` (volts)
 * Fleet-store heartbeat therefore patches `power` for the visible sidebar badge.
 */
export function heartbeatVoltageToPowerPatch(externalVoltage) {
  const power = parseTelemetryNumber(externalVoltage);
  if (power == null) return null;
  return { power };
}

export function formatTelemetryDisplay(key, value, noDataLabel = "—") {
  if (value == null || !Number.isFinite(value)) return noDataLabel;
  if (key === "batteryLevel") return `${value}%`;
  return `${value} V`;
}
