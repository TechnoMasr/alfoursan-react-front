import { carPath } from "../../../services/carPath.js";
import { getCarStatus } from "../../../utils/getCarStatus.js";

/**
 * Live/base fields that affect Google marker fillColor (via getCarStatus)
 * and rotation (direction):
 * - color: speed, isOffline, isInactive, lastSignel*, motion freshness (isVehicleMoving)
 * - rotation: direction
 *
 * Position/rotation immediate path (subscribeFleet → setPosition/RAF) does NOT
 * update icon rotation. Throttled dirty-id icon path owns color + rotation setIcon.
 */

export function getMarkerVisualState(mergedCar) {
  if (!mergedCar) {
    return { color: "#6b7280", rotation: 0 };
  }
  return {
    color: getCarStatus(mergedCar).color,
    rotation: Number(mergedCar.direction) || 0,
  };
}

export function shouldUpdateMarkerIcon(existingIcon, color, rotation) {
  const currentColor =
    existingIcon && typeof existingIcon === "object" && "fillColor" in existingIcon
      ? existingIcon.fillColor
      : null;
  const currentRotation =
    existingIcon && typeof existingIcon === "object" && "rotation" in existingIcon
      ? existingIcon.rotation
      : null;
  return currentColor !== color || currentRotation !== rotation;
}

/** Build Google Symbol icon options (PointCtor = google.maps.Point). */
export function buildGoogleCarIconOptions(color, rotation, PointCtor) {
  return {
    path: carPath,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: "#000",
    strokeWeight: 0.7,
    scale: 0.05,
    rotation,
    anchor: new PointCtor(156, 256),
    labelOrigin: new PointCtor(156, 700),
  };
}

/**
 * Decide whether icon refresh should walk the full fleet or only dirty ids.
 * @returns {{ mode: "full" } | { mode: "dirty", ids: string[] }}
 */
export function resolveGoogleIconRefreshPlan({
  membershipChanged,
  baseMetaChanged,
  fleetDirtyIds,
}) {
  if (membershipChanged || baseMetaChanged) return { mode: "full" };
  if (fleetDirtyIds == null) return { mode: "full" };
  // Immutable snapshot for this flush — do not mutate caller's array
  return { mode: "dirty", ids: Array.from(fleetDirtyIds) };
}

/**
 * Targeted (or full) icon refresh without walking unrelated markers in dirty mode.
 * Dirty mode uses getCarById(id) — must be O(1); do not scan the fleet to rediscover dirties.
 * @returns {{ considered: number, setIconCalls: number, skippedMissing: number }}
 */
export function applyGoogleMarkerVisualRefresh({
  plan,
  allCars,
  getCarById,
  getMarker,
  mergeCar,
  PointCtor,
}) {
  const stats = { considered: 0, setIconCalls: 0, skippedMissing: 0 };

  const refreshOne = (car) => {
    if (car?.id == null) return;
    stats.considered += 1;
    const marker = getMarker(car.id);
    if (!marker) {
      stats.skippedMissing += 1;
      return;
    }
    const merged = mergeCar(car);
    if (!merged?.position) return;
    const { color, rotation } = getMarkerVisualState(merged);
    const existingIcon =
      typeof marker.getIcon === "function" ? marker.getIcon() : marker.icon;
    if (!shouldUpdateMarkerIcon(existingIcon, color, rotation)) return;
    const nextIcon = buildGoogleCarIconOptions(color, rotation, PointCtor);
    if (typeof marker.setIcon === "function") {
      marker.setIcon(nextIcon);
    } else {
      marker.icon = nextIcon;
    }
    stats.setIconCalls += 1;
  };

  if (plan.mode === "full") {
    for (const car of allCars || []) {
      refreshOne(car);
    }
    return stats;
  }

  for (const id of plan.ids) {
    const car = getCarById ? getCarById(id) : null;
    if (!car) {
      stats.considered += 1;
      stats.skippedMissing += 1;
      continue;
    }
    refreshOne(car);
  }
  return stats;
}
