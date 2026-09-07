import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import { createPortal } from "react-dom";
import CarPopup from "../../../components/common/CarPopup";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { changeZoom } from "../../../store/mapSlice";
import { carPath } from "../../../services/carPath";
import { getCarStatus } from "../../../utils/getCarStatus";
import { getOsmTileLayer } from "./osmTileLayers";
import {
  getFleetLive,
  mergeCarWithFleet,
  subscribeFleet,
} from "../../../utils/fleetPositionStore";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

function createCarDivIcon(car, showLabel) {
  const color = getCarStatus(car).color;
  const rotation = car.direction || 0;
  const name = car.name || "بدون اسم";
  const labelHtml = showLabel
    ? '<div class="car-label-osm">' + name + "</div>"
    : "";

  const html =
    '<div class="car-marker-wrap" style="transform:rotate(' +
    rotation +
    'deg)">' +
    '<svg viewBox="0 0 312 512" width="14" height="22" style="display:block">' +
    '<path d="' +
    carPath +
    '" fill="' +
    color +
    '" stroke="#000" stroke-width="2"/>' +
    "</svg></div>" +
    labelHtml;

  return L.divIcon({
    className: "car-marker-leaflet",
    html: html.replace(/motion\.div/g, "div"),
    iconSize: [14, 22],
    iconAnchor: [7, 11],
  });
}

/** مزامنة المركز/التكبير فقط عند تغيّر خارجي واضح (تجنّب حلقة zoom + اهتزاز) */
function MapViewSync({ center, zoom }) {
  const map = useMap();
  const skipNextRef = useRef(false);

  useEffect(() => {
    if (!center || zoom == null) return;

    const c = map.getCenter();
    const z = map.getZoom();
    const sameCenter =
      Math.abs(c.lat - center.lat) < 1e-6 &&
      Math.abs(c.lng - center.lng) < 1e-6;
    const sameZoom = z === zoom;

    if (sameCenter && sameZoom) return;

    skipNextRef.current = true;
    map.setView([center.lat, center.lng], zoom, { animate: false });
  }, [map, center?.lat, center?.lng, zoom]);

  useMapEvents({
    zoomend: () => {
      if (skipNextRef.current) {
        skipNextRef.current = false;
      }
    },
  });

  return null;
}

function MapZoomReporter() {
  const dispatch = useDispatch();
  const map = useMap();
  const lastZoomRef = useRef(null);

  useMapEvents({
    zoomend: () => {
      const z = map.getZoom();
      if (lastZoomRef.current === z) return;
      lastZoomRef.current = z;
      dispatch(changeZoom(z));
    },
  });

  return null;
}

function CarMarkersLayer({
  validCars,
  selectedCarId,
  handleSelectCar,
  clusters,
  showDeviceName,
}) {
  const map = useMap();
  const markersRef = useRef(new Map());
  const clusterGroupRef = useRef(null);
  const labelStateRef = useRef(new Map());
  const handleSelectCarRef = useRef(handleSelectCar);

  useEffect(() => {
    handleSelectCarRef.current = handleSelectCar;
  }, [handleSelectCar]);

  const getCarColor = useCallback((car) => getCarStatus(car).color, []);

  // إنشاء/إزالة طبقة التجميع فقط عند تغيّر clusters
  useEffect(() => {
    if (!map) return;

    if (clusterGroupRef.current) {
      map.removeLayer(clusterGroupRef.current);
      clusterGroupRef.current = null;
    }

    if (!clusters) return;

    const group = L.markerClusterGroup({
      maxClusterRadius: 60,
      disableClusteringAtZoom: 18,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
    });
    map.addLayer(group);
    clusterGroupRef.current = group;

    return () => {
      if (clusterGroupRef.current) {
        map.removeLayer(clusterGroupRef.current);
        clusterGroupRef.current = null;
      }
    };
  }, [map, clusters]);

  // تحديث الماركرات بدون إعادة بناء cluster group
  useEffect(() => {
    if (!map) return;

    const clusterGroup = clusterGroupRef.current;
    const markers = markersRef.current;
    const currentIds = new Set(validCars.map((c) => c.id));

    validCars.forEach((car) => {
      const latlng = [car.position.lat, car.position.lng];
      let marker = markers.get(car.id);

      const meta = labelStateRef.current.get(car.id) || {};
      const needsIconUpdate =
        !marker ||
        meta.color !== getCarColor(car) ||
        meta.rotation !== (car.direction || 0) ||
        meta.showLabel !== showDeviceName ||
        meta.name !== (car.name || "");

      if (!marker) {
        marker = L.marker(latlng, {
          icon: createCarDivIcon(car, showDeviceName),
        });
        marker.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          handleSelectCarRef.current(car);
        });
        markers.set(car.id, marker);

        if (clusterGroup) clusterGroup.addLayer(marker);
        else marker.addTo(map);
      } else {
        marker.setLatLng(latlng);
        if (needsIconUpdate) {
          marker.setIcon(createCarDivIcon(car, showDeviceName));
        }
        if (clusterGroup && !clusterGroup.hasLayer(marker)) {
          if (map.hasLayer(marker)) map.removeLayer(marker);
          clusterGroup.addLayer(marker);
        } else if (!clusterGroup && !map.hasLayer(marker)) {
          marker.addTo(map);
        }
      }

      labelStateRef.current.set(car.id, {
        color: getCarColor(car),
        rotation: car.direction || 0,
        showLabel: showDeviceName,
        name: car.name || "",
      });

      // لا نرفع z-index للماركر المحدد — نافذة المعلومات في pane أعلى
      marker.setZIndexOffset(0);
    });

    Array.from(markers.keys()).forEach((id) => {
      if (currentIds.has(id)) return;
      const m = markers.get(id);
      if (clusterGroup?.hasLayer(m)) clusterGroup.removeLayer(m);
      else if (m) map.removeLayer(m);
      markers.delete(id);
      labelStateRef.current.delete(id);
    });
  }, [map, validCars, selectedCarId, clusters, showDeviceName, getCarColor]);

  // Phase A: targeted imperative update for the changed device only.
  // Must NOT setCars / mergeCarsWithFleet / rebuild all markers from this path.
  useEffect(() => {
    if (!map) return undefined;
    return subscribeFleet((_version, change) => {
      if (change?.visualChanged === false) return;
      const id = change?.deviceId;
      if (id == null) return;
      const marker = markersRef.current.get(id);
      if (!marker) return;
      const live = change?.next ?? getFleetLive(id);
      const lat = live?.position?.lat;
      const lng = live?.position?.lng;
      if (typeof lat !== "number" || typeof lng !== "number") return;
      if (Number.isNaN(lat) || Number.isNaN(lng)) return;
      marker.setLatLng([lat, lng]);

      const meta = labelStateRef.current.get(id);
      const rotation = Number(live.direction) || 0;
      if (!meta || meta.rotation === rotation) return;

      const partialCar = {
        id,
        name: meta.name,
        direction: rotation,
        speed: live.speed,
        ignition_on: live.ignition_on,
        motion: live.motion,
        charge: live.charge,
        isOffline: live.isOffline,
        isInactive: live.isInactive,
        lastMovingReceivedAtMs: live.lastMovingReceivedAtMs,
        lastLiveReceivedAtMs: live.lastLiveReceivedAtMs,
        lastFixAtMs: live.lastFixAtMs,
        position: live.position,
      };
      marker.setIcon(createCarDivIcon(partialCar, showDeviceName));
      labelStateRef.current.set(id, {
        ...meta,
        rotation,
        color: getCarColor(partialCar),
      });
    });
  }, [map, showDeviceName, getCarColor]);

  useEffect(() => {
    return () => {
      markersRef.current.forEach((m) => {
        try {
          map.removeLayer(m);
        } catch {
          // ignore
        }
      });
      markersRef.current.clear();
    };
  }, [map]);

  return null;
}

/** مسافة بين طرف السهم ونقطة ارتكاز أيقونة السيارة (px) */
const POPUP_GAP_ABOVE_CAR = 36;

/** نافذة معلومات مرتبطة بموقع السيارة (داخل حاوية الخريطة) */
function CarInfoOverlay({ car, onClose }) {
  const map = useMap();
  const stackRef = useRef(null);
  const [screenPos, setScreenPos] = useState(null);
  const [mapContainer, setMapContainer] = useState(null);
  const rafRef = useRef(0);
  const latLngRef = useRef([car.position.lat, car.position.lng]);

  useEffect(() => {
    const el = stackRef.current;
    if (!el) return;
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
  }, []);

  useEffect(() => {
    latLngRef.current = [car.position.lat, car.position.lng];
  }, [car.position.lat, car.position.lng]);

  useEffect(() => {
    const container = map.getContainer();
    if (container) setMapContainer(container);
  }, [map]);

  useEffect(() => {
    if (!map) return undefined;

    const update = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const [lat, lng] = latLngRef.current;
        const pt = map.latLngToContainerPoint([lat, lng]);
        setScreenPos({ x: pt.x, y: pt.y });
      });
    };

    update();
    map.on("move", update);
    map.on("zoom", update);
    map.on("resize", update);
    map.on("viewreset", update);

    return () => {
      map.off("move", update);
      map.off("zoom", update);
      map.off("resize", update);
      map.off("viewreset", update);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [map, car.position.lat, car.position.lng]);

  if (!screenPos || !mapContainer) return null;

  return createPortal(
    <div
      className="car-osm-info-overlay"
      style={{
        position: "absolute",
        left: screenPos.x,
        top: screenPos.y,
        transform: `translate(-50%, calc(-100% - ${POPUP_GAP_ABOVE_CAR}px))`,
        pointerEvents: "none",
        zIndex: 1000,
      }}
    >
      <div ref={stackRef} className="car-osm-info-stack">
        <div className="car-osm-info-panel">
          <button
            type="button"
            className="car-osm-info-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
          <CarPopup car={car} />
        </div>
        <div className="car-osm-info-arrow" aria-hidden />
      </div>
    </div>,
    mapContainer,
  );
}

const OpenStreetMapView = ({
  cars,
  fleetVersion = 0,
  center,
  zoom,
  selectedCarId,
  handleSelectCar,
}) => {
  const { clusters, mapType, showDeviceName } = useSelector(
    (state) => state.map,
  );
  const tile = useMemo(() => getOsmTileLayer(mapType), [mapType]);

  const validCars = useMemo(() => {
    const byId = new Map();
    (cars || []).forEach((car) => {
      const merged = mergeCarWithFleet(car);
      const lat = merged?.position?.lat;
      const lng = merged?.position?.lng;
      const ok =
        typeof lat === "number" &&
        typeof lng === "number" &&
        !Number.isNaN(lat) &&
        !Number.isNaN(lng);
      if (!ok || merged?.id == null) return;
      byId.set(merged.id, merged);
    });
    return Array.from(byId.values());
  }, [cars, fleetVersion]);

  const selectedCar = useMemo(
    () => validCars.find((c) => c.id === selectedCarId) || null,
    [validCars, selectedCarId],
  );

  const initialCenter = center || { lat: 23.8859, lng: 41.0792 };
  const initialZoom = zoom ?? 7;

  return (
    <MapContainer
      center={[initialCenter.lat, initialCenter.lng]}
      zoom={initialZoom}
      className="w-full h-full z-0"
      style={{ width: "100%", height: "100%" }}
      zoomControl={false}
      attributionControl
    >
      <TileLayer
        key={mapType}
        url={tile.url}
        attribution={tile.attribution}
        maxZoom={tile.maxZoom}
      />
      <MapViewSync center={center} zoom={zoom} />
      <MapZoomReporter />
      <CarMarkersLayer
        validCars={validCars}
        selectedCarId={selectedCarId}
        handleSelectCar={handleSelectCar}
        clusters={clusters}
        showDeviceName={showDeviceName}
      />

      {selectedCar && (
        <CarInfoOverlay
          car={selectedCar}
          onClose={() => handleSelectCar(null)}
        />
      )}

      <MapClickDeselect onDeselect={() => handleSelectCar(null)} />
    </MapContainer>
  );
};

function MapClickDeselect({ onDeselect }) {
  useMapEvents({
    click: (e) => {
      const target = e.originalEvent?.target;
      if (target?.closest?.(".car-osm-info-overlay")) return;
      onDeselect();
    },
  });
  return null;
}

export default OpenStreetMapView;
