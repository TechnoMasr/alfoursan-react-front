/** Shared position interpolation helpers (DeviceTracking + fleet map markers). */

export function distanceMeters(a, b) {
  if (!a || !b) return 0;
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const aa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return R * c;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/** Duration in ms for marker animation between two lat/lng points. */
export function computeAnimDurationMs(start, end, { minMs = 250, maxMs = 900, msPerMeter = 6 } = {}) {
  const d = distanceMeters(start, end);
  return Math.max(minMs, Math.min(maxMs, d * msPerMeter));
}

/** Degrees-based duration (legacy GoogleMapView formula). */
export function computeAnimDurationDeg(start, end, { minMs = 250, maxMs = 900, scale = 120000 } = {}) {
  const dLat = end.lat - start.lat;
  const dLng = end.lng - start.lng;
  const dist = Math.sqrt(dLat * dLat + dLng * dLng);
  return Math.max(minMs, Math.min(maxMs, dist * scale));
}
