/**
 * TenantDashboard list derivation helpers (Phase F1).
 * Branch options = base metadata; filtered list may reuse live refs.
 */

/** Branch select options from base API `cars` (not live materialization). */
export function deriveBranchesFromBaseCars(baseCars) {
  const map = new Map();
  (baseCars || []).forEach((c) => {
    const id = c?.branch_effective_id ?? null;
    const name = c?.branch_effective_name ?? null;
    if (id != null && name) {
      map.set(String(id), { id: String(id), name: String(name) });
    }
  });
  return Array.from(map.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "ar"),
  );
}

/**
 * Status filter over live carsByBranch.
 * activeFilter === "all" → same reference (no clone).
 */
export function deriveFilteredCars(carsByBranch, activeFilter, isVehicleMoving) {
  if (activeFilter === "all") return carsByBranch;
  return (carsByBranch || []).filter((car) => {
    if (activeFilter === "inactive") return !!car.isInactive;
    if (activeFilter === "online") return !car.isOffline && !car.isInactive;
    if (activeFilter === "offline") return !!car.isOffline && !car.isInactive;
    if (activeFilter === "moving") {
      return !car.isOffline && !car.isInactive && isVehicleMoving(car);
    }
    return true;
  });
}
