import { getMapTilerStyleUrl } from "./mapTilerConfig";

/** أنماط MapTiler المتاحة في القائمة (mapType في Redux) */
export const MAPTILER_MAP_TYPES = [
  { id: "mt-streets", styleId: "streets-v2", labelKey: "mapTypes.mtStreets" },
  { id: "mt-satellite", styleId: "satellite", labelKey: "mapTypes.mtSatellite" },
  { id: "mt-hybrid", styleId: "hybrid", labelKey: "mapTypes.mtHybrid" },
  { id: "mt-outdoor", styleId: "outdoor-v2", labelKey: "mapTypes.mtOutdoor" },
  { id: "mt-topo", styleId: "topo-v2", labelKey: "mapTypes.mtTopo" },
  { id: "mt-basic", styleId: "basic-v2", labelKey: "mapTypes.mtBasic" },
  { id: "mt-bright", styleId: "bright-v2", labelKey: "mapTypes.mtBright" },
  { id: "mt-winter", styleId: "winter-v2", labelKey: "mapTypes.mtWinter" },
  { id: "mt-dataviz", styleId: "dataviz", labelKey: "mapTypes.mtDataviz" },
];

const styleIdByMapType = Object.fromEntries(
  MAPTILER_MAP_TYPES.map((t) => [t.id, t.styleId]),
);

export const DEFAULT_MAPTILER_MAP_TYPE = "mt-streets";

export function isMapTilerMapType(mapType) {
  return Boolean(styleIdByMapType[mapType]);
}

export function getMapTilerStyle(mapType) {
  const styleId =
    styleIdByMapType[mapType] ||
    styleIdByMapType[DEFAULT_MAPTILER_MAP_TYPE];
  return getMapTilerStyleUrl(styleId);
}
