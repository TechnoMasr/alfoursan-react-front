import MapGL, { Source, Layer } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { createPortal } from "react-dom";
import CarPopup from "../../../components/common/CarPopup";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { changeZoom } from "../../../store/mapSlice";
import { mergeCarWithFleet } from "../../../utils/fleetPositionStore";
import { getMapLibreStyle } from "./mapLibreStyles";
import {
  FLEET_ARROW_LAYER,
  FLEET_CIRCLE_LAYER,
  FLEET_HIT_LAYER_IDS,
  FLEET_LABEL_LAYER,
  FLEET_SOURCE_ID,
} from "./fleetGeoJson";
import { useFleetGeoJsonSource } from "./useFleetGeoJsonSource";

const POPUP_GAP_ABOVE_CAR = 36;

function CarInfoOverlayMapLibre({ mapRef, car, onClose }) {
  const [screenPos, setScreenPos] = useState(null);
  const [container, setContainer] = useState(null);
  const rafRef = useRef(0);

  useEffect(() => {
    let map = mapRef.current?.getMap?.();
    if (!map || !car?.position) return undefined;

    setContainer(map.getContainer());

    const update = () => {
      map = mapRef.current?.getMap?.();
      if (!map) return;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const p = map.project([car.position.lng, car.position.lat]);
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
  }, [mapRef, car?.position?.lat, car?.position?.lng]);

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
  fleetVersion = 0,
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
  const carsRef = useRef(cars);
  carsRef.current = cars;

  const mapStyle = useMemo(() => getMapLibreStyle(mapType), [mapType]);

  const { initialData, getFeatureCarIdFromEvent, flush } = useFleetGeoJsonSource({
    mapRef,
    cars,
    selectedCarId,
  });

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

  const onMapClick = useCallback(
    (e) => {
      const carId = getFeatureCarIdFromEvent(e);
      if (carId == null) {
        handleSelectCar(null);
        return;
      }
      const base = (carsRef.current || []).find((c) => c.id === carId);
      if (base) handleSelectCar(mergeCarWithFleet(base));
    },
    [getFeatureCarIdFromEvent, handleSelectCar],
  );

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const selectedCar = useMemo(() => {
    if (selectedCarId == null) return null;
    const base = (cars || []).find((c) => c.id === selectedCarId);
    return base ? mergeCarWithFleet(base) : null;
  }, [cars, selectedCarId, fleetVersion]);

  const labelLayout = useMemo(
    () => ({
      ...FLEET_LABEL_LAYER.layout,
      visibility: showDeviceName ? "visible" : "none",
    }),
    [showDeviceName],
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
      onClick={onMapClick}
      interactiveLayerIds={FLEET_HIT_LAYER_IDS}
      onLoad={() => flush()}
      attributionControl
    >
      <Source id={FLEET_SOURCE_ID} type="geojson" data={initialData}>
        <Layer {...FLEET_CIRCLE_LAYER} />
        <Layer {...FLEET_ARROW_LAYER} />
        <Layer {...FLEET_LABEL_LAYER} layout={labelLayout} />
      </Source>

      {selectedCar?.position && (
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
