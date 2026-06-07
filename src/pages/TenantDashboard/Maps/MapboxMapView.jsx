import Map, { Marker, Popup } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import CarPopup from "../../../components/common/CarPopup";
import { useSelector } from "react-redux";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { mergeCarWithFleet } from "../../../utils/fleetPositionStore";

const MapboxMapView = ({
  cars,
  fleetVersion = 0,
  viewState,
  setViewState,
  MAPBOX_TOKEN,
  selectedCarId,
  handleSelectCar,
}) => {
  const { showDeviceName } = useSelector((state) => state.map);
  const rafRef = useRef(null);
  const lastMoveTsRef = useRef(0);

  const onMove = useCallback(
    (evt) => {
      const next = evt.viewState;
      const now = Date.now();
      // خفّف updates أثناء السحب لتقليل rerenders (يساعد جدًا مع عدد markers كبير)
      if (now - lastMoveTsRef.current < 50) return;
      lastMoveTsRef.current = now;

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => setViewState(next));
    },
    [setViewState]
  );

  const onMoveEnd = useCallback(
    (evt) => {
      setViewState(evt.viewState);
    },
    [setViewState]
  );

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const validCars = useMemo(() => {
    return (cars || [])
      .map(mergeCarWithFleet)
      .filter(
        (car) =>
          car?.position &&
          !isNaN(car.position.lat) &&
          !isNaN(car.position.lng),
      );
  }, [cars, fleetVersion]);

  return (
    <Map
      mapboxAccessToken={MAPBOX_TOKEN}
      {...viewState}
      onMove={onMove}
      onMoveEnd={onMoveEnd}
      style={{ width: "100%", height: "100%" }}
      mapStyle="mapbox://styles/mapbox/streets-v11"
      onClick={() => handleSelectCar(null)}
    >
      {validCars.map((car) => (
        <Marker
          key={car.id}
          longitude={car.position.lng}
          latitude={car.position.lat}
          anchor="center"
          style={{ transition: "transform 600ms linear" }}
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            handleSelectCar(car);
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              transform: "translateY(-10px)",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                transform: `rotate(${car.direction}deg)`,
                width: 40,
                height: 40,
              }}
            >
              <img
                src={
                  car.speed > 1
                    ? "/car-green.svg?v=1"
                    : car.speed === 0
                    ? "/car-red.svg?v=1"
                    : "/car-blue.svg?v=1"
                }
                alt={car.name}
                className="w-full h-full object-contain"
              />
            </div>

            {showDeviceName && (
              <div
                className="bg-white text-black text-sm py-1 px-2 rounded-lg shadow-lg w-max 
                absolute top-[calc(100%+5px)] left-1/2 translate-x-[-50%] whitespace-nowrap"
                onClick={(e) => e.stopPropagation()}
              >
                {car.name || "بدون اسم"}
                <span className="absolute bg-white w-2 h-2 rotate-45 -top-1 left-1/2 translate-x-[-50%]" />
              </div>
            )}
          </div>
        </Marker>
      ))}

      {/* Popup لما تختار عربية */}
      {selectedCarId &&
        (() => {
          const car = validCars?.find(
            (c) =>
              c.id === selectedCarId &&
              c?.position &&
              !isNaN(c.position.lat) &&
              !isNaN(c.position.lng)
          );
          if (!car) return null;
          return (
            <Popup
              longitude={car.position.lng}
              latitude={car.position.lat}
              maxWidth="none"
              closeOnClick={false}
              onClose={() => handleSelectCar(null)}
              style={{
                padding: 0,
                backgroundColor: "transparent",
              }}
            >
              <div className="w-full h-full pt-6 bg-white rounded-xl shadow-lg
              ">
              <CarPopup car={car} />
              </div>
            </Popup>
          );
        })()}
    </Map>
  );
};

export default MapboxMapView;
