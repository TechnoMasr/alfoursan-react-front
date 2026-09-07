/**
 * Membership-stable Google carsMetaById maintenance (Phase F1).
 *
 * Stores current filtered/live car object refs as base for mergeCarWithFleet /
 * marker create. Live telemetry remains owned by fleetPositionStore.
 */

/**
 * @returns {{ mode: "full"|"dirty"|"noop", updated: number, list: object[] }}
 */
export function syncGoogleCarsMetaById({
  cars,
  byId,
  carIdsKey,
  prevCarIdsKey,
  carsBaseEpoch,
  prevCarsBaseEpoch,
  fleetDirtyIds,
}) {
  const list = cars || [];
  const membershipChanged = prevCarIdsKey !== carIdsKey;
  const baseChanged = prevCarsBaseEpoch !== carsBaseEpoch;
  const needsFull =
    membershipChanged ||
    baseChanged ||
    byId.size === 0 ||
    prevCarIdsKey == null;

  if (needsFull) {
    const nextIds = new Set();
    let updated = 0;
    for (const car of list) {
      if (car?.id == null) continue;
      byId.set(car.id, car);
      nextIds.add(car.id);
      updated += 1;
    }
    for (const id of Array.from(byId.keys())) {
      if (!nextIds.has(id)) byId.delete(id);
    }
    return { mode: "full", updated, list };
  }

  if (fleetDirtyIds == null || fleetDirtyIds.length === 0) {
    return { mode: "noop", updated: 0, list };
  }

  const dirty = new Set(fleetDirtyIds);
  let updated = 0;
  for (const car of list) {
    if (car?.id == null) continue;
    if (!dirty.has(car.id)) continue;
    byId.set(car.id, car);
    updated += 1;
    if (updated >= dirty.size) break;
  }

  return { mode: "dirty", updated, list };
}
