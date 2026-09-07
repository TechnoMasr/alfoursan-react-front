/** Shared Google Supercluster options — single source of truth (do not scatter maxZoom). */
export const GOOGLE_SUPERCLUSTER_OPTIONS = {
  radius: 60,
  maxZoom: 18,
  minPoints: 3,
};

/** Leading-edge coalesce for realtime reload when clustering is active and relevant. */
export const CLUSTER_RELOAD_COALESCE_MS = 200;

/**
 * Realtime cluster index maintenance is only useful when clustering is enabled
 * and the map zoom is within Supercluster's clustering range.
 */
export function isRealtimeClusterMaintenanceEligible({
  clustersEnabled,
  zoom,
  maxZoom = GOOGLE_SUPERCLUSTER_OPTIONS.maxZoom,
}) {
  if (!clustersEnabled) return false;
  if (zoom == null || Number.isNaN(Number(zoom))) return false;
  return Number(zoom) <= Number(maxZoom);
}

/**
 * After a feature-coord change while load was skipped, decide next step.
 * @returns {"schedule" | "mark_stale"}
 */
export function decideRealtimeClusterReloadAction({
  clustersEnabled,
  zoom,
  maxZoom = GOOGLE_SUPERCLUSTER_OPTIONS.maxZoom,
}) {
  if (
    isRealtimeClusterMaintenanceEligible({
      clustersEnabled,
      zoom,
      maxZoom,
    })
  ) {
    return "schedule";
  }
  return "mark_stale";
}

/**
 * Before painting/querying clusters: if index is stale and now relevant, reload once.
 * @returns {{ didLoad: boolean, stale: boolean }}
 */
export function resolveStaleClusterIndexBeforePaint({
  stale,
  clustersEnabled,
  zoom,
  maxZoom = GOOGLE_SUPERCLUSTER_OPTIONS.maxZoom,
  loadLatest,
}) {
  if (!stale) return { didLoad: false, stale: false };
  if (
    !isRealtimeClusterMaintenanceEligible({
      clustersEnabled,
      zoom,
      maxZoom,
    })
  ) {
    return { didLoad: false, stale: true };
  }
  loadLatest();
  return { didLoad: true, stale: false };
}

/**
 * Timer callback for coalesced realtime reload — re-check eligibility at fire time.
 * @returns {{ didLoad: boolean, stale: boolean }}
 */
export function runCoalescedClusterReload({
  clustersEnabled,
  zoom,
  maxZoom = GOOGLE_SUPERCLUSTER_OPTIONS.maxZoom,
  loadLatest,
  wasStale = true,
}) {
  if (
    !isRealtimeClusterMaintenanceEligible({
      clustersEnabled,
      zoom,
      maxZoom,
    })
  ) {
    // Features may have moved while waiting — keep/mark stale.
    return { didLoad: false, stale: true };
  }
  loadLatest();
  return { didLoad: true, stale: false };
}
