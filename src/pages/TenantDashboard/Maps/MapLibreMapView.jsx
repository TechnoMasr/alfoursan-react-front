import MapGL, { Marker } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { createPortal } from "react-dom";
import CarPopup from "../../../components/common/CarPopup";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { changeZoom } from "../../../store/mapSlice";
import { getCarStatus } from "../../../utils/getCarStatus";
import { carPath } from "../../../services/carPath";
import { getMapLibreStyle } from "./mapLibreStyles";

const POPUP_GAP_ABOVE_CAR = 36;
const CAR_ICON_W = 16;
const CAR_ICON_H = 22;

function CarMarkerIcon({ car }) {
  const color = getCarStatus(car).color;
  const rotation = car.direction || 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        transform: "translateY(-5px)",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          transform: `rotate(${rotation}deg)`,
          width: CAR_ICON_W,
          height: CAR_ICON_H,
        }}
      >
        <svg
          viewBox="0 0 312 512"
          width={CAR_ICON_W}
          height={CAR_ICON_H}
          style={{ display: "block" }}
        >
          <path
            d={carPath}
            fill={color}
            stroke="#000"
            strokeWidth="2"
          />
        </svg>
      </div>
    </div>
  );
}

function CarInfoOverlayMapLibre({ mapRef, car, onClose }) {
  const [screenPos, setScreenPos] = useState(null);
  const [container, setContainer] = useState(null);
  const rafRef = useRef(0);

  useEffect(() => {
    let map = mapRef.current?.getMap?.();
    if (!map) return undefined;

    setContainer(map.getContainer());

    const lat = car.position.lat;
    const lng = car.position.lng;

    const update = () => {
      map = mapRef.current?.getMap?.();
      if (!map) return;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const p = map.project([lng, lat]);
        setScreenPos({ x: p.x, y: p.y });
      });
    };

    update();
    map.on("move", update);
    map.on("zoom", update);
    map.on("resize", update);

    return () => {
      map.off("move", update);
      map.off("zoom", update);
      map.off("resize", update);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [mapRef, car.position.lat, car.position.lng]);

  if (!screenPos || !container) return null;

  return createPortal(
    <div
      className="car-osm-info-overlay maplibre-car-info-overlay"
      style={{
        position: "absolute",
        left: screenPos.x,
        top: screenPos.y,
        transform: `translate(-50%, calc(-100% - ${POPUP_GAP_ABOVE_CAR}px))`,
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      <div
        className="car-osm-info-stack"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
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
    container,
  );
}

const MapLibreMapView = ({
  cars,
  viewState,
  setViewState,
  selectedCarId,
  handleSelectCar,
}) => {
  const dispatch = useDispatch();
  const { mapType, showDeviceName } = useSelector((state) => state.map);
  const mapRef = useRef(null);
  const rafRef = useRef(null);
  const lastMoveTsRef = useRef(0);

  const mapStyle = useMemo(() => getMapLibreStyle(mapType), [mapType]);

  const onMove = useCallback(
    (evt) => {
      const next = evt.viewState;
      const now = Date.now();
      if (now - lastMoveTsRef.current < 50) return;
      lastMoveTsRef.current = now;

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => setViewState(next));
    },
    [setViewState],
  );

  const onMoveEnd = useCallback(
    (evt) => {
      setViewState(evt.viewState);
      dispatch(changeZoom(Math.round(evt.viewState.zoom)));
    },
    [setViewState, dispatch],
  );

  const handleMarkerClick = useCallback(
    (e, car) => {
      e.originalEvent?.stopPropagation?.();
      e.stopPropagation?.();
      handleSelectCar(car);
    },
    [handleSelectCar],
  );

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const validCars = useMemo(() => {
    const byId = new Map();
    (cars || []).forEach((car) => {
      const lat = car?.position?.lat;
      const lng = car?.position?.lng;
      const ok =
        typeof lat === "number" &&
        typeof lng === "number" &&
        !Number.isNaN(lat) &&
        !Number.isNaN(lng);
      if (!ok || car?.id == null) return;
      byId.set(car.id, car);
    });
    return Array.from(byId.values());
  }, [cars]);

  const selectedCar = useMemo(
    () => validCars.find((c) => c.id === selectedCarId) || null,
    [validCars, selectedCarId],
  );

  return (
    <MapGL
      ref={mapRef}
      key={mapType}
      {...viewState}
      onMove={onMove}
      onMoveEnd={onMoveEnd}
      mapStyle={mapStyle}
      style={{ width: "100%", height: "100%" }}
      onClick={() => handleSelectCar(null)}
      attributionControl
    >
      {validCars.map((car) => (
        <Marker
          key={car.id}
          longitude={car.position.lng}
          latitude={car.position.lat}
          anchor="center"
          onClick={(e) => handleMarkerClick(e, car)}
        >
          <div
            className="flex flex-col items-center"
            onClick={(e) => {
              e.stopPropagation();
              handleSelectCar(car);
            }}
          >
            <CarMarkerIcon car={car} />
            {showDeviceName && (
              <div className="bg-white text-black text-[10px] py-0.5 px-1.5 rounded shadow mt-0.5 whitespace-nowrap pointer-events-none">
                {car.name || "بدون اسم"}
              </div>
            )}
          </div>
        </Marker>
      ))}

      {selectedCar && (
        <CarInfoOverlayMapLibre
          mapRef={mapRef}
          car={selectedCar}
          onClose={() => handleSelectCar(null)}
        />
      )}
    </MapGL>
  );
};

export default MapLibreMapView;
