import { GoogleMap, InfoWindow } from "@react-google-maps/api";
import CarPopup from "../../../components/common/CarPopup";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Supercluster from "supercluster";
import { useDispatch, useSelector } from "react-redux";
import { openGeoFenceModal } from "../../../store/modalsSlice";
import { changeZoom, isGoogleMapType } from "../../../store/mapSlice";
import { carPath } from "../../../services/carPath";
import { getCarStatus } from "../../../utils/getCarStatus";
import {
  getFleetLive,
  mergeCarWithFleet,
  subscribeFleet,
} from "../../../utils/fleetPositionStore";
import { computeAnimDurationDeg, easeOutCubic } from "../../../utils/positionAnimation";

const GoogleMapView = ({
  cars,
  fleetVersion = 0,
  center,
  zoom,
  selectedCarId,
  handleSelectCar,
}) => {
  const [map, setMap] = useState(null);
  const drawingManagerRef = useRef(null);
  const superclusterRef = useRef(null);
  const carMarkersRef = useRef(new Map());
  const clusterMarkersRef = useRef([]);
  const markerLabelMetaRef = useRef(new Map());
  const pendingMarkerUpdatesRef = useRef(new Map());
  const markerRafRef = useRef(0);
  const markerAnimRef = useRef(new Map());
  const markerAnimRafRef = useRef(0);
  const geojsonFeaturesRef = useRef([]);
  const featureByCarIdRef = useRef(new Map());
  const clusterRefreshTimerRef = useRef(0);
  const clusterReloadTimerRef = useRef(0);
  const carsMetaRef = useRef([]);
  const carsMetaByIdRef = useRef(new Map());
  const selectedCarIdRef = useRef(selectedCarId);
  const updateClustersRef = useRef(null);

  selectedCarIdRef.current = selectedCarId;

  const {
    clusters,
    mapType,
    showDeviceName,
  } = useSelector((state) => state.map);

  const googleMapTypeId = isGoogleMapType(mapType) ? mapType : "roadmap";
  const dispatch = useDispatch();

  const onLoad = useCallback((loadedMap) => {
    setMap(loadedMap);
  }, []);

  const getCarColor = useCallback((car) => getCarStatus(car).color, []);

  const carIdsKey = useMemo(() => {
    return (cars || [])
      .map((c) => c?.id)
      .filter((id) => id != null)
      .sort((a, b) => a - b)
      .join(",");
  }, [cars]);

  const buildGeoJsonFeatures = useCallback((list) => {
    const byId = new Map();
    (list || []).forEach((car) => {
      const merged = mergeCarWithFleet(car);
      const lat = merged?.position?.lat;
      const lng = merged?.position?.lng;
      const ok =
        typeof lat === "number" &&
        typeof lng === "number" &&
        !isNaN(lat) &&
        !isNaN(lng);
      if (!ok || merged?.id == null) return;
      byId.set(merged.id, merged);
    });
    return Array.from(byId.values()).map((car) => ({
      type: "Feature",
      properties: { cluster: false, carId: car.id, car },
      geometry: {
        type: "Point",
        coordinates: [car.position.lng, car.position.lat],
      },
    }));
  }, []);

  const animateMarkerTo = useCallback((markers, id, pos) => {
    const m = markers.get(id);
    if (!m) return;
    const cur = m.getPosition();
    const curLat = cur && typeof cur.lat === "function" ? cur.lat() : null;
    const curLng = cur && typeof cur.lng === "function" ? cur.lng() : null;
    const same =
      curLat != null &&
      curLng != null &&
      curLat === pos.lat &&
      curLng === pos.lng;
    if (same) return;

    const now = performance.now();
    const start =
      curLat != null && curLng != null ? { lat: curLat, lng: curLng } : pos;
    const end = pos;
    const dur = computeAnimDurationDeg(start, end);

    markerAnimRef.current.set(id, { start, end, t0: now, dur });

    const tick = (t) => {
      markerAnimRafRef.current = 0;
      const anims = markerAnimRef.current;
      if (!anims.size) return;

      anims.forEach((a, carId) => {
        const mm = markers.get(carId);
        if (!mm) {
          anims.delete(carId);
          return;
        }
        const tt = Math.min(1, (t - a.t0) / a.dur);
        const e = easeOutCubic(tt);
        mm.setPosition({
          lat: a.start.lat + (a.end.lat - a.start.lat) * e,
          lng: a.start.lng + (a.end.lng - a.start.lng) * e,
        });
        if (tt >= 1) anims.delete(carId);
      });

      if (anims.size) {
        markerAnimRafRef.current = requestAnimationFrame(tick);
      }
    };

    if (!markerAnimRafRef.current) {
      markerAnimRafRef.current = requestAnimationFrame(tick);
    }
  }, []);

  const triggerClusterRefresh = useCallback(() => {
    if (clusterRefreshTimerRef.current) return;
    clusterRefreshTimerRef.current = window.setTimeout(() => {
      clusterRefreshTimerRef.current = 0;
      if (map && window.google?.maps?.event) {
        window.google.maps.event.trigger(map, "idle");
      }
    }, 200);
  }, [map]);

  const scheduleClusterReload = useCallback(() => {
    if (clusterReloadTimerRef.current) return;
    clusterReloadTimerRef.current = window.setTimeout(() => {
      clusterReloadTimerRef.current = 0;
      if (superclusterRef.current) {
        superclusterRef.current.load(geojsonFeaturesRef.current);
      }
      triggerClusterRefresh();
    }, 200);
  }, [triggerClusterRefresh]);

  const createRotatedMarker = useCallback(
    (car, targetMap) => {
      const merged = mergeCarWithFleet(car);
      const color = getCarColor(merged);
      const rotation = merged.direction || 0;
      const marker = new window.google.maps.Marker({
        position: merged.position,
        map: targetMap,
        icon: {
          path: carPath,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#000",
          strokeWeight: 0.7,
          scale: 0.05,
          rotation,
          anchor: new window.google.maps.Point(156, 256),
          labelOrigin: new window.google.maps.Point(156, 700),
        },
      });
      marker.addListener("click", () => handleSelectCar(merged));
      return marker;
    },
    [getCarColor, handleSelectCar],
  );

  const clearClusterMarkers = useCallback(() => {
    clusterMarkersRef.current.forEach((m) => m.setMap(null));
    clusterMarkersRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      if (markerRafRef.current) cancelAnimationFrame(markerRafRef.current);
      if (markerAnimRafRef.current) cancelAnimationFrame(markerAnimRafRef.current);
      if (clusterRefreshTimerRef.current) clearTimeout(clusterRefreshTimerRef.current);
      if (clusterReloadTimerRef.current) clearTimeout(clusterReloadTimerRef.current);
      markerRafRef.current = 0;
      markerAnimRafRef.current = 0;
      clusterRefreshTimerRef.current = 0;
      clusterReloadTimerRef.current = 0;
      pendingMarkerUpdatesRef.current.clear();
      clearClusterMarkers();
      carMarkersRef.current.forEach((m) => m.setMap(null));
      carMarkersRef.current.clear();
    };
  }, [clearClusterMarkers]);

  useEffect(() => {
    carsMetaRef.current = cars || [];
    carsMetaByIdRef.current = new Map(
      (cars || [])
        .filter((car) => car?.id != null)
        .map((car) => [car.id, car]),
    );
  }, [cars]);

  useEffect(() => {
    if (!superclusterRef.current) {
      superclusterRef.current = new Supercluster({
        radius: 60,
        maxZoom: 18,
        minPoints: 3,
      });
    }
    const features = buildGeoJsonFeatures(carsMetaRef.current);
    geojsonFeaturesRef.current = features;
    featureByCarIdRef.current = new Map(
      features.map((feature) => [feature.properties.carId, feature]),
    );
    superclusterRef.current.load(features);
    triggerClusterRefresh();
  }, [carIdsKey, buildGeoJsonFeatures, triggerClusterRefresh]);

  useEffect(() => {
    if (!map || !window.google) return;

    const markers = carMarkersRef.current;
    const list = carsMetaRef.current;
    const currentIds = new Set(list.map((c) => c.id));

    list.forEach((car) => {
      if (car?.id == null) return;
      const merged = mergeCarWithFleet(car);
      if (!merged.position) return;

      const existing = markers.get(car.id);
      if (!existing) {
        markers.set(car.id, createRotatedMarker(car, map));
        return;
      }

      const color = getCarColor(merged);
      const rotation = merged.direction || 0;
      const icon = existing.getIcon();
      const currentColor = icon && "fillColor" in icon ? icon.fillColor : null;
      const currentRotation = icon && "rotation" in icon ? icon.rotation : null;
      if (currentColor !== color || currentRotation !== rotation) {
        existing.setIcon({
          path: carPath,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#000",
          strokeWeight: 0.7,
          scale: 0.05,
          rotation,
          anchor: new window.google.maps.Point(156, 256),
          labelOrigin: new window.google.maps.Point(156, 700),
        });
      }
    });

    Array.from(markers.keys()).forEach((id) => {
      if (currentIds.has(id)) return;
      const m = markers.get(id);
      if (m) m.setMap(null);
      markers.delete(id);
    });
  }, [map, carIdsKey, createRotatedMarker, getCarColor, fleetVersion]);

  useEffect(() => {
    if (!map || !window.google) return;

    const applyFleetPositions = (_version, change) => {
      const markers = carMarkersRef.current;
      let clusterDirty = false;
      const updates =
        change?.deviceId != null
          ? [
              {
                id: change.deviceId,
                live: change.next ?? getFleetLive(change.deviceId),
              },
            ]
          : carsMetaRef.current.map((car) => ({
              id: car.id,
              live: getFleetLive(car.id),
            }));

      updates.forEach(({ id, live }) => {
        if (id == null) return;
        if (!live?.position) return;
        let marker = markers.get(id);
        const baseCar = carsMetaByIdRef.current.get(id);
        if (!marker && baseCar) {
          marker = createRotatedMarker(
            { ...baseCar, ...live, position: live.position },
            map,
          );
          markers.set(id, marker);
        }
        if (marker) pendingMarkerUpdatesRef.current.set(id, live.position);

        let feat = featureByCarIdRef.current.get(id);
        if (!feat && baseCar) {
          const merged = { ...baseCar, ...live, position: live.position };
          feat = {
            type: "Feature",
            properties: { cluster: false, carId: id, car: merged },
            geometry: {
              type: "Point",
              coordinates: [live.position.lng, live.position.lat],
            },
          };
          geojsonFeaturesRef.current.push(feat);
          featureByCarIdRef.current.set(id, feat);
          clusterDirty = true;
          return;
        }
        if (feat) {
          const [lng, lat] = feat.geometry.coordinates;
          if (lng !== live.position.lng || lat !== live.position.lat) {
            feat.geometry.coordinates = [live.position.lng, live.position.lat];
            if (feat.properties?.car) {
              feat.properties.car = { ...feat.properties.car, ...live };
            }
            clusterDirty = true;
          }
        }
      });

      if (!markerRafRef.current) {
        markerRafRef.current = requestAnimationFrame(() => {
          markerRafRef.current = 0;
          const pending = pendingMarkerUpdatesRef.current;
          pendingMarkerUpdatesRef.current = new Map();
          pending.forEach((pos, id) => {
            animateMarkerTo(markers, id, pos);
          });
        });
      }

      if (clusterDirty && superclusterRef.current) {
        scheduleClusterReload();
      }
    };

    applyFleetPositions();
    return subscribeFleet(applyFleetPositions);
  }, [map, animateMarkerTo, createRotatedMarker, scheduleClusterReload]);

  useEffect(() => {
    if (!map || !window.google) return;

    const markers = carMarkersRef.current;
    const labelMeta = markerLabelMetaRef.current;
    const currentIds = new Set((cars || []).map((c) => c.id));

    (cars || []).forEach((car) => {
      const marker = markers.get(car.id);
      if (!marker) return;

      const nextText = car.name || "بدون اسم";
      const meta = labelMeta.get(car.id) || { shown: null, text: null };

      if (showDeviceName) {
        if (meta.shown === true && meta.text === nextText) return;
        marker.setLabel({
          text: nextText,
          color: "#212121",
          fontWeight: "bold",
          fontSize: "12px",
          className: "car-label",
        });
        meta.shown = true;
        meta.text = nextText;
        labelMeta.set(car.id, meta);
        return;
      }

      if (meta.shown === false) return;
      marker.setLabel(null);
      meta.shown = false;
      meta.text = null;
      labelMeta.set(car.id, meta);
    });

    Array.from(labelMeta.keys()).forEach((id) => {
      if (!currentIds.has(id)) labelMeta.delete(id);
    });
  }, [map, cars, showDeviceName, carIdsKey]);

  useEffect(() => {
    if (!map || !window.google || !superclusterRef.current) return;

    const markers = carMarkersRef.current;

    const updateClusters = () => {
      if (!clusters) {
        clearClusterMarkers();
        markers.forEach((m) => {
          m.setVisible(true);
          if (!m.getMap()) m.setMap(map);
        });
        return;
      }

      markers.forEach((m) => {
        if (!m.getMap()) m.setMap(map);
        m.setVisible(false);
      });

      if (selectedCarIdRef.current) {
        const selectedMarker = markers.get(selectedCarIdRef.current);
        if (selectedMarker) selectedMarker.setVisible(true);
      }

      clearClusterMarkers();

      const bounds = map.getBounds();
      if (!bounds) return;

      const bbox = [
        bounds.getSouthWest().lng(),
        bounds.getSouthWest().lat(),
        bounds.getNorthEast().lng(),
        bounds.getNorthEast().lat(),
      ];

      const clustersData = superclusterRef.current.getClusters(
        bbox,
        map.getZoom(),
      );

      clustersData.forEach((feature) => {
        const [lng, lat] = feature.geometry.coordinates;
        const position = { lat, lng };

        if (feature.properties.cluster) {
          const marker = new window.google.maps.Marker({
            position,
            map,
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              fillColor: "#2196F3",
              fillOpacity: 0.85,
              strokeColor: "#fff",
              strokeWeight: 2,
              scale: 20,
            },
            label: {
              text: String(feature.properties.point_count),
              color: "#fff",
              fontWeight: "bold",
              fontSize: "14px",
            },
            zIndex: 1000,
          });

          marker.addListener("click", () => {
            const expansionZoom =
              superclusterRef.current.getClusterExpansionZoom(
                feature.properties.cluster_id,
              );
            map.setZoom(expansionZoom);
            map.panTo(position);
          });

          clusterMarkersRef.current.push(marker);
        } else {
          const car = feature.properties.car;
          const m = markers.get(car.id);
          if (m) m.setVisible(true);
        }
      });
    };

    updateClustersRef.current = updateClusters;
    updateClusters();
    const idleListener = map.addListener("idle", updateClusters);
    return () => {
      updateClustersRef.current = null;
      clearClusterMarkers();
      if (idleListener) idleListener.remove();
    };
  }, [map, clusters, clearClusterMarkers, carIdsKey]);

  useEffect(() => {
    updateClustersRef.current?.();
  }, [selectedCarId]);

  useEffect(() => {
    const handleDrawingStart = (e) => {
      const { type } = e.detail;
      if (!window.google || !map) return;
      if (!window.google.maps.drawing) return;

      if (drawingManagerRef.current) {
        drawingManagerRef.current.setMap(null);
      }

      const manager = new window.google.maps.drawing.DrawingManager({
        drawingMode:
          type === "circle"
            ? window.google.maps.drawing.OverlayType.CIRCLE
            : window.google.maps.drawing.OverlayType.POLYGON,
        drawingControl: false,
        circleOptions: {
          fillColor: "#2196F3",
          fillOpacity: 0.3,
          strokeColor: "#0D47A1",
          strokeWeight: 2,
          editable: true,
          draggable: true,
        },
        polygonOptions: {
          fillColor: "#4CAF50",
          fillOpacity: 0.3,
          strokeColor: "#1B5E20",
          strokeWeight: 2,
          editable: true,
          draggable: true,
        },
      });

      manager.setMap(map);
      drawingManagerRef.current = manager;

      window.google.maps.event.addListener(manager, "overlaycomplete", (ev) => {
        let overlay = ev.overlay;
        if (ev.type === "circle") {
          const center = overlay.getCenter();
          const radius = overlay.getRadius();
          dispatch(
            openGeoFenceModal({
              fenceData: {
                type: "circle",
                center: center.toJSON(),
                radius: radius.toFixed(2),
              },
              mission: "add",
            }),
          );
        } else if (ev.type === "polygon") {
          const path = overlay
            .getPath()
            .getArray()
            .map((p) => p.toJSON());
          dispatch(
            openGeoFenceModal({ fenceData: { type: "polygon", path }, mission: "add" }),
          );
        }
        overlay.setEditable(false);
        overlay.setDraggable(false);
        manager.setDrawingMode(null);
        window.currentShape = overlay;
      });
    };

    const handleClearShape = () => {
      if (window.currentShape) {
        window.currentShape.setMap(null);
        window.currentShape = null;
      }
    };

    window.addEventListener("start-drawing", handleDrawingStart);
    window.addEventListener("clear-shape", handleClearShape);
    return () => {
      window.removeEventListener("start-drawing", handleDrawingStart);
      window.removeEventListener("clear-shape", handleClearShape);
    };
  }, [dispatch, map]);

  const handleZoomChanged = () => {
    if (!map) return;
    dispatch(changeZoom(map.getZoom()));
  };

  const selectedCar = useMemo(() => {
    if (!selectedCarId) return null;
    const base = (cars || []).find((c) => c.id === selectedCarId);
    return base ? mergeCarWithFleet(base) : null;
  }, [cars, selectedCarId, fleetVersion]);

  const infoWindowOffset = useMemo(
    () =>
      window.google?.maps
        ? new window.google.maps.Size(0, -40)
        : undefined,
    [map],
  );

  return (
    <GoogleMap
      mapContainerStyle={{ width: "100%", height: "100%" }}
      center={center}
      zoom={zoom}
      onZoomChanged={handleZoomChanged}
      onLoad={onLoad}
      onClick={() => selectedCarId && handleSelectCar(null)}
      options={{
        fullscreenControl: false,
        mapTypeControl: false,
        mapTypeId: googleMapTypeId,
      }}
    >
      {selectedCar && selectedCar.position && (
        <InfoWindow
          key={selectedCarId}
          position={selectedCar.position}
          onCloseClick={() => handleSelectCar(null)}
          options={{ pixelOffset: infoWindowOffset }}
        >
          <CarPopup car={selectedCar} />
        </InfoWindow>
      )}
    </GoogleMap>
  );
};

export default GoogleMapView;
