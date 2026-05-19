import { GoogleMap, InfoWindow } from "@react-google-maps/api";
import CarPopup from "../../../components/common/CarPopup";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Supercluster from "supercluster";
import { useDispatch, useSelector } from "react-redux";
import { openGeoFenceModal } from "../../../store/modalsSlice";
import { changeZoom, isGoogleMapType } from "../../../store/mapSlice";
import { carPath } from "../../../services/carPath";
import { getCarStatus } from "../../../utils/getCarStatus";

const GoogleMapView = ({
  cars,
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
  const markerAnimRef = useRef(new Map()); // id -> { start, end, t0, dur }
  const markerAnimRafRef = useRef(0);

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

  const validCars = useMemo(() => {
    const byId = new Map();
    (cars || []).forEach((car) => {
      const lat = car?.position?.lat;
      const lng = car?.position?.lng;
      const ok = typeof lat === "number" && typeof lng === "number" && !isNaN(lat) && !isNaN(lng);
      if (!ok || car?.id == null) return;
      byId.set(car.id, car); // dedupe by id (يمنع أي تكرار بالـ API/Socket)
    });
    return Array.from(byId.values());
  }, [cars]);

  // ✅ تحويل السيارات إلى GeoJSON features لـ Supercluster
  const geojsonFeatures = useMemo(() => {
    return validCars.map((car) => ({
      type: "Feature",
      properties: {
        cluster: false,
        carId: car.id,
        car,
      },
      geometry: {
        type: "Point",
        coordinates: [car.position.lng, car.position.lat],
      },
    }));
  }, [validCars]);

  // ✅ إنشاء/تحديث Supercluster
  useEffect(() => {
    if (!geojsonFeatures.length) return;

    if (!superclusterRef.current) {
      superclusterRef.current = new Supercluster({
        radius: 60,
        maxZoom: 18,
        minPoints: 3,
      });
    }

    superclusterRef.current.load(geojsonFeatures);
  }, [geojsonFeatures]);

  // ✅ إنشاء ماركر باستخدام SVG path (يدعم الدوران مباشرة)
  const createRotatedMarker = useCallback((car, targetMap) => {
    const color = getCarColor(car);
    const rotation = car.direction || 0;

    const markerOptions = {
      position: car.position,
      map: targetMap,
      icon: {
        path: carPath,
        fillColor: color,
        fillOpacity: 1,
        strokeColor: "#000",
        strokeWeight: 0.7,
        scale: 0.05,
        rotation: rotation,
        anchor: new window.google.maps.Point(156, 256),
        labelOrigin: new window.google.maps.Point(156, 700),
      },
    };

    const marker = new window.google.maps.Marker(markerOptions);
    marker.addListener("click", () => handleSelectCar(car));

    return marker;
  }, [getCarColor, handleSelectCar]);

  const clearClusterMarkers = useCallback(() => {
    clusterMarkersRef.current.forEach((m) => m.setMap(null));
    clusterMarkersRef.current = [];
  }, []);

  // ✅ Cleanup قوي عند unmount (يمنع double markers في React StrictMode/dev)
  useEffect(() => {
    return () => {
      try {
        if (markerRafRef.current) cancelAnimationFrame(markerRafRef.current);
      } catch {
        // ignore
      }
      markerRafRef.current = 0;
      pendingMarkerUpdatesRef.current.clear();

      try {
        clearClusterMarkers();
      } catch {
        // ignore
      }

      try {
        carMarkersRef.current.forEach((m) => m.setMap(null));
        carMarkersRef.current.clear();
      } catch {
        // ignore
      }
    };
  }, [clearClusterMarkers]);

  // ✅ إنشاء/تحديث/حذف ماركرات العربيات (مرة واحدة كمصدر للحقيقة)
  useEffect(() => {
    if (!map || !window.google) return;

    const markers = carMarkersRef.current;
    const currentIds = new Set(validCars.map((c) => c.id));

    validCars.forEach((car) => {
      const existing = markers.get(car.id);
      const color = getCarColor(car);
      const rotation = car.direction || 0;

      if (!existing) {
        const m = createRotatedMarker(car, map);
        markers.set(car.id, m);
      } else {
        // ✅ اجمع تحديثات الـ position في RAF واحد لتقليل الوميض/الـ repaint
        pendingMarkerUpdatesRef.current.set(car.id, car.position);
        if (!markerRafRef.current) {
          markerRafRef.current = requestAnimationFrame(() => {
            markerRafRef.current = 0;
            const pending = pendingMarkerUpdatesRef.current;
            pendingMarkerUpdatesRef.current = new Map();
            pending.forEach((pos, id) => {
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

              // ✅ حركة ناعمة: انيميشن خفيف بين النقطة الحالية والنقطة الجديدة
              const now = performance.now();
              const start =
                curLat != null && curLng != null ? { lat: curLat, lng: curLng } : pos;
              const end = pos;
              const dLat = end.lat - start.lat;
              const dLng = end.lng - start.lng;
              const dist = Math.sqrt(dLat * dLat + dLng * dLng);
              // مدة بسيطة (clamp) — هدفنا "نعومة قليلة" بدون lag كبير
              const dur = Math.max(250, Math.min(900, dist * 120000)); // dist بالدرجات تقريبًا

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
                  // easeOutCubic
                  const e = 1 - Math.pow(1 - tt, 3);
                  const next = {
                    lat: a.start.lat + (a.end.lat - a.start.lat) * e,
                    lng: a.start.lng + (a.end.lng - a.start.lng) * e,
                  };
                  mm.setPosition(next);
                  if (tt >= 1) anims.delete(carId);
                });

                if (anims.size) {
                  markerAnimRafRef.current = requestAnimationFrame(tick);
                }
              };

              if (!markerAnimRafRef.current) {
                markerAnimRafRef.current = requestAnimationFrame(tick);
              }
            });
          });
        }

        // تحديث الأيقونة مباشرة (اللون والاتجاه)
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
            rotation: rotation,
            anchor: new window.google.maps.Point(156, 256),
            labelOrigin: new window.google.maps.Point(156, 700),
          });
        }
      }
    });

    // إزالة الماركرات اللي اختفت
    Array.from(markers.keys()).forEach((id) => {
      if (currentIds.has(id)) return;
      const m = markers.get(id);
      if (m) m.setMap(null);
      markers.delete(id);
    });
  }, [map, validCars, createRotatedMarker, getCarColor]);

  // ✅ Cleanup للأنيميشن
  useEffect(() => {
    return () => {
      try {
        if (markerAnimRafRef.current) cancelAnimationFrame(markerAnimRafRef.current);
      } catch {
        // ignore
      }
      markerAnimRafRef.current = 0;
      markerAnimRef.current.clear();
    };
  }, []);

  // ✅ إدارة أسماء الأجهزة (labels) بشكل خفيف جدًا:
  // - لا نستدعي setLabel إلا عند تغيير الاسم أو عند toggle showDeviceName
  useEffect(() => {
    if (!map || !window.google) return;

    const markers = carMarkersRef.current;
    const labelMeta = markerLabelMetaRef.current;
    const currentIds = new Set(validCars.map((c) => c.id));

    validCars.forEach((car) => {
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

      // showDeviceName = false
      if (meta.shown === false) return;
      marker.setLabel(null);
      meta.shown = false;
      meta.text = null;
      labelMeta.set(car.id, meta);
    });

    // تنظيف meta للعناصر المحذوفة
    Array.from(labelMeta.keys()).forEach((id) => {
      if (!currentIds.has(id)) labelMeta.delete(id);
    });
  }, [map, validCars, showDeviceName]);

  // ✅ إدارة التجميع (Clusters) + تحديثه على idle بدل حسابه في كل render
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

      // clusters ON
      markers.forEach((m) => {
        if (!m.getMap()) m.setMap(map);
        m.setVisible(false);
      });

      // selected marker always visible
      if (selectedCarId) {
        const selectedMarker = markers.get(selectedCarId);
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

      const currentZoom = map.getZoom();
      const clustersData = superclusterRef.current.getClusters(bbox, currentZoom);

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
                feature.properties.cluster_id
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

    updateClusters();

    const idleListener = map.addListener("idle", updateClusters);
    return () => {
      clearClusterMarkers();
      if (idleListener) idleListener.remove();
    };
  }, [map, clusters, selectedCarId, clearClusterMarkers]);

  // ##########################################
  // ✅ رسم الجيوفنس
  // ##########################################
  useEffect(() => {
    const handleDrawingStart = (e) => {
      const { type } = e.detail;
      if (!window.google || !map) return;

      if (!window.google.maps.drawing) {
        console.error("Google Maps Drawing library not loaded");
        return;
      }

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
          const circleData = {
            type: "circle",
            center: center.toJSON(),
            radius: radius.toFixed(2),
          };

          dispatch(
            openGeoFenceModal({ fenceData: circleData, mission: "add" })
          );
        } else if (ev.type === "polygon") {
          const path = overlay
            .getPath()
            .getArray()
            .map((p) => p.toJSON());
          const polygonData = { type: "polygon", path };

          dispatch(
            openGeoFenceModal({ fenceData: polygonData, mission: "add" })
          );
        }

        overlay.setEditable(false);
        overlay.setDraggable(false);
        manager.setDrawingMode(null);
        window.currentShape = overlay;
      });
    };

    const handleEditShape = (event) => {
      const { type, polygonData, center, radius } = event.detail;
      if (!window.google || !map) return;

      if (window.currentShape) window.currentShape.setMap(null);

      if (type === "polygon") {
        const polygon = new window.google.maps.Polygon({
          paths: polygonData,
          strokeColor: "#FF0000",
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor: "#FF0000",
          fillOpacity: 0.35,
        });
        polygon.setMap(map);
        window.currentShape = polygon;

        const bounds = new window.google.maps.LatLngBounds();
        polygonData.forEach((point) => bounds.extend(point));
        map.fitBounds(bounds);
      }

      if (type === "circle") {
        const circle = new window.google.maps.Circle({
          center,
          radius,
          strokeColor: "#FF5722",
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor: "#FF9800",
          fillOpacity: 0.35,
        });
        circle.setMap(map);
        window.currentShape = circle;

        const bounds = new window.google.maps.LatLngBounds();
        const north = window.google.maps.geometry.spherical.computeOffset(
          center,
          radius,
          0
        );
        const south = window.google.maps.geometry.spherical.computeOffset(
          center,
          radius,
          180
        );
        const east = window.google.maps.geometry.spherical.computeOffset(
          center,
          radius,
          90
        );
        const west = window.google.maps.geometry.spherical.computeOffset(
          center,
          radius,
          270
        );
        bounds.extend(north);
        bounds.extend(south);
        bounds.extend(east);
        bounds.extend(west);
        map.fitBounds(bounds);
      }
    };

    const handleClearShape = () => {
      if (window.currentShape) {
        window.currentShape.setMap(null);
        window.currentShape = null;
      }
    };

    const handleShowAllPolygons = (event) => {
      const { fences } = event.detail;
      if (!window.google || !map || !fences) return;

      if (window.allShapes) {
        window.allShapes.forEach((shape) => shape.setMap(null));
      }
      window.allShapes = [];

      const bounds = new window.google.maps.LatLngBounds();

      fences.forEach((fence, index) => {
        let shape;

        if (
          fence.type === "circle" &&
          fence.latitude &&
          fence.longitude &&
          fence.radius
        ) {
          shape = new window.google.maps.Circle({
            center: {
              lat: parseFloat(fence.latitude),
              lng: parseFloat(fence.longitude),
            },
            radius: parseFloat(fence.radius),
            strokeColor: "#FF5722",
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: getColorByIndex(index),
            fillOpacity: 0.35,
            map: map,
          });

          const center = shape.getCenter();
          const radius = shape.getRadius();
          const north = window.google.maps.geometry.spherical.computeOffset(
            center,
            radius,
            0
          );
          const south = window.google.maps.geometry.spherical.computeOffset(
            center,
            radius,
            180
          );
          const east = window.google.maps.geometry.spherical.computeOffset(
            center,
            radius,
            90
          );
          const west = window.google.maps.geometry.spherical.computeOffset(
            center,
            radius,
            270
          );

          bounds.extend(north);
          bounds.extend(south);
          bounds.extend(east);
          bounds.extend(west);
        } else if (
          fence.type === "polygon" &&
          fence.coordinates &&
          fence.coordinates.length > 0
        ) {
          const paths = fence.coordinates.map((coord) =>
            Array.isArray(coord) ? { lat: coord[0], lng: coord[1] } : coord
          );

          shape = new window.google.maps.Polygon({
            paths: paths,
            strokeColor: "#2196F3",
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: getColorByIndex(index),
            fillOpacity: 0.35,
            map: map,
          });

          paths.forEach((point) => bounds.extend(point));
        }

        if (shape) window.allShapes.push(shape);
      });

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds);

        if (bounds.toSpan().lat() < 0.001 || bounds.toSpan().lng() < 0.001) {
          map.setZoom(map.getZoom() - 2);
        }
      }
    };

    const getColorByIndex = (index) => {
      const colors = [
        "#FF5722",
        "#2196F3",
        "#4CAF50",
        "#FF9800",
        "#9C27B0",
        "#00BCD4",
        "#8BC34A",
        "#E91E63",
        "#3F51B5",
        "#009688",
        "#CDDC39",
        "#673AB7",
      ];
      return colors[index % colors.length];
    };

    window.addEventListener("start-drawing", handleDrawingStart);
    window.addEventListener("edit-shape", handleEditShape);
    window.addEventListener("clear-shape", handleClearShape);
    window.addEventListener("show-all-polygons", handleShowAllPolygons);
    return () => {
      window.removeEventListener("start-drawing", handleDrawingStart);
      window.removeEventListener("edit-shape", handleEditShape);
      window.removeEventListener("clear-shape", handleClearShape);
      window.removeEventListener("show-all-polygons", handleShowAllPolygons);
      if (window.allShapes) {
        window.allShapes.forEach((shape) => shape.setMap(null));
        window.allShapes = [];
      }
    };
  }, [dispatch, map]);

  const handleZoomChanged = () => {
    if (!map) return;

    const newZoom = map.getZoom();
    dispatch(changeZoom(newZoom));
  };

  return (
    <>
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
        {selectedCarId &&
          (() => {
            const car = validCars.find((c) => c.id === selectedCarId);
            if (!car) return null;
            return (
              <InfoWindow
                position={car.position}
                onCloseClick={() => handleSelectCar(null)}
                options={{ pixelOffset: new window.google.maps.Size(0, -40) }}
              >
                <CarPopup car={car} />
              </InfoWindow>
            );
          })()}
      </GoogleMap>
    </>
  );
};

export default GoogleMapView;
