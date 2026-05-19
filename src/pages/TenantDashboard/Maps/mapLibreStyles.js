import { OSM_TILE_LAYERS } from "./osmTileLayers";

function expandTileUrls(url) {
  if (!url.includes("{s}")) return [url];
  return ["a", "b", "c"].map((s) => url.replace("{s}", s));
}

function rasterStyleFromLayer(layer) {
  return {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles: expandTileUrls(layer.url),
        tileSize: 256,
        attribution: layer.attribution,
        maxzoom: layer.maxZoom ?? 19,
      },
    },
    layers: [
      {
        id: "basemap",
        type: "raster",
        source: "basemap",
      },
    ],
  };
}

function hybridStyle() {
  const sat = OSM_TILE_LAYERS.satellite;
  const road = OSM_TILE_LAYERS.roadmap;
  return {
    version: 8,
    sources: {
      satellite: {
        type: "raster",
        tiles: expandTileUrls(sat.url),
        tileSize: 256,
        maxzoom: sat.maxZoom ?? 19,
      },
      labels: {
        type: "raster",
        tiles: expandTileUrls(road.url),
        tileSize: 256,
        maxzoom: road.maxZoom ?? 19,
      },
    },
    layers: [
      { id: "satellite", type: "raster", source: "satellite" },
      {
        id: "labels",
        type: "raster",
        source: "labels",
        paint: { "raster-opacity": 0.55 },
      },
    ],
  };
}

/** MapLibre GL style (raster) حسب mapType من Redux */
export function getMapLibreStyle(mapType) {
  if (mapType === "hybrid") return hybridStyle();
  const layer = OSM_TILE_LAYERS[mapType] || OSM_TILE_LAYERS.roadmap;
  return rasterStyleFromLayer(layer);
}
