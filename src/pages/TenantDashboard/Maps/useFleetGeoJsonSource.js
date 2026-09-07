import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  getFleetLive,
  mergeCarWithFleet,
  subscribeFleet,
} from "../../../utils/fleetPositionStore";
import {
  FLEET_SOURCE_ID,
  carToFleetFeature,
  carsToFleetFeatureCollection,
} from "./fleetGeoJson";

const SET_DATA_COALESCE_MS = 80;

/**
 * Keeps a GeoJSON FeatureCollection in sync with cars membership + live GPS
 * via fleetPositionStore, pushing to map source.setData without React Marker trees.
 */
export function useFleetGeoJsonSource({
  mapRef,
  cars,
  selectedCarId,
  getMap,
}) {
  const featuresByIdRef = useRef(new Map());
  const selectedIdRef = useRef(selectedCarId);
  const setDataTimerRef = useRef(0);
  const carsMetaByIdRef = useRef(new Map());
  const carsRef = useRef(cars);
  carsRef.current = cars;
  selectedIdRef.current = selectedCarId;

  const carIdsKey = useMemo(() => {
    return (cars || [])
      .map((c) => c?.id)
      .filter((id) => id != null)
      .sort((a, b) => String(a).localeCompare(String(b)))
      .join(",");
  }, [cars]);

  const pushToMap = useCallback(() => {
    const map =
      typeof getMap === "function" ? getMap() : mapRef?.current?.getMap?.();
    if (!map) return;
    const source = map.getSource?.(FLEET_SOURCE_ID);
    if (!source || typeof source.setData !== "function") return;
    source.setData({
      type: "FeatureCollection",
      features: Array.from(featuresByIdRef.current.values()),
    });
  }, [getMap, mapRef]);

  const schedulePush = useCallback(() => {
    if (setDataTimerRef.current) return;
    setDataTimerRef.current = window.setTimeout(() => {
      setDataTimerRef.current = 0;
      pushToMap();
    }, SET_DATA_COALESCE_MS);
  }, [pushToMap]);

  // Membership change only (stable carIdsKey)
  useEffect(() => {
    const list = carsRef.current;
    const fc = carsToFleetFeatureCollection(list, selectedIdRef.current);
    const next = new Map();
    const meta = new Map();
    fc.features.forEach((f) => next.set(f.properties.carId, f));
    (list || []).forEach((car) => {
      if (car?.id != null) meta.set(car.id, car);
    });
    featuresByIdRef.current = next;
    carsMetaByIdRef.current = meta;
    pushToMap();
  }, [carIdsKey, pushToMap]);

  // Patch meta refs for dirty rematerialized cars without full GeoJSON rebuild
  useEffect(() => {
    const list = cars || [];
    const meta = carsMetaByIdRef.current;
    list.forEach((car) => {
      if (car?.id == null) return;
      if (meta.get(car.id) !== car) meta.set(car.id, car);
    });
  }, [cars]);

  useEffect(() => {
    const byId = featuresByIdRef.current;
    let changed = false;
    byId.forEach((feat, id) => {
      const want = selectedCarId != null && id === selectedCarId ? 1 : 0;
      if (feat.properties.selected !== want) {
        feat.properties.selected = want;
        changed = true;
      }
    });
    if (changed) pushToMap();
  }, [selectedCarId, pushToMap]);

  useEffect(() => {
    const apply = (_version, change) => {
      if (change?.visualChanged === false) return;
      const updates =
        change?.deviceId != null
          ? [change.deviceId]
          : Array.from(featuresByIdRef.current.keys());

      let dirty = false;
      updates.forEach((id) => {
        if (id == null) return;
        const live =
          change?.deviceId === id
            ? change.next ?? getFleetLive(id)
            : getFleetLive(id);
        const base = carsMetaByIdRef.current.get(id);
        if (!base && !live) return;
        const merged = mergeCarWithFleet({ ...(base || { id }), ...(live || {}) });
        const feature = carToFleetFeature(merged, selectedIdRef.current);
        if (!feature) {
          if (featuresByIdRef.current.delete(id)) dirty = true;
          return;
        }
        featuresByIdRef.current.set(id, feature);
        dirty = true;
      });
      if (dirty) schedulePush();
    };

    apply();
    return subscribeFleet(apply);
  }, [schedulePush]);

  useEffect(() => {
    return () => {
      if (setDataTimerRef.current) clearTimeout(setDataTimerRef.current);
      setDataTimerRef.current = 0;
    };
  }, []);

  const emptyCollection = useMemo(
    () => ({ type: "FeatureCollection", features: [] }),
    [],
  );

  return {
    initialData: emptyCollection,
    carIdsKey,
    flush: pushToMap,
    getFeatureCarIdFromEvent: (e) => {
      const props = e?.features?.[0]?.properties;
      if (!props) return null;
      const id = props.carId;
      if (id == null) return null;
      const asNum = Number(id);
      return Number.isFinite(asNum) && String(asNum) === String(id) ? asNum : id;
    },
  };
}
