import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, InfoWindow, Marker, useLoadScript } from "@react-google-maps/api";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import LoadingPage from "../../components/Loading/LoadingPage";
import CarPopup from "../../components/common/CarPopup";
import { getTrackingDevice } from "../../services/monitorServices";
import useCarSocket from "../../hooks/useCarSocket";
import { carPath } from "../../services/carPath";
import { getCarStatus } from "../../utils/getCarStatus";
import { telemetryFromMongo } from "../../utils/deviceTelemetry";
import { useTranslation } from "react-i18next";
import AlarmPoolBtn from "../../components/common/AlarmPoolBtn";

const containerStyle = { width: "100%", height: "100vh" };

const getCarColor = (car) => getCarStatus(car).color;

const DeviceTracking = () => {
  const { t } = useTranslation();
  const { id } = useParams();
  const deviceId = useMemo(() => Number(id), [id]);

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: "AIzaSyBuFc-F9K_-1QkQnLoTIecBlNz6LfCS1wg",
    language: "ar",
  });

  const lastGeocodeAtRef = useRef(0);
  const lastAddressPosRef = useRef(null);
  const [address, setAddress] = useState("");
  const [mapRef, setMapRef] = useState(null);
  const [cars, setCars] = useState([]);
  const [isInit, setIsInit] = useState(false);
  const [initialCenter, setInitialCenter] = useState({ lat: 23.8859, lng: 45.0792 });
  const [showInfo, setShowInfo] = useState(false);

  // ✅ سلاسة حركة السيارة: نعرض position متحرك بين A -> B
  const [renderPos, setRenderPos] = useState(null);
  const animRef = useRef({ raf: 0, start: null, end: null, t0: 0, dur: 0 });
  const lastPanCheckRef = useRef(0);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["trackingDevice", deviceId],
    queryFn: () => getTrackingDevice(deviceId),
    enabled: Number.isFinite(deviceId) && deviceId > 0,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // تهيئة بيانات السيارة مرة واحدة من API
  useEffect(() => {
    const device = data || null;
    if (!device) return;
    const status = device.device_status ?? device.deviceStatus ?? null;
    const lat = Number(status?.last_lat);
    const lng = Number(status?.last_lon);
    const position =
      Number.isFinite(lat) && Number.isFinite(lng)
        ? { lat, lng }
        : { lat: 23.8859, lng: 45.0792 };

    const initialCar = {
      id: device.id,
      name: device.name,
      serial_number: device.serial_number,
      iccid: device.iccid,
      contact_person: device.contact_person,
      contact_phone: device.contact_phone,
      position,
      speed: Number(status?.last_speed) || 0,
      direction: Number(status?.last_direction) || 0,
      charge: status?.charge ?? device.charge ?? null,
      ignition_on: status?.ignition_on ?? device.ignition_on ?? null,
      motion: status?.motion ?? device.motion ?? null,
      ...telemetryFromMongo(status),
      lastSignel: status?.last_packet_at || status?.last_activity_at,
      lastSignelGPS: status?.last_gps_at,
      voltageLevel:
        status?.last_voltage_unit === "mv"
          ? `${(Number(status?.last_voltage) / 1000).toFixed(2)} V`
          : status?.last_voltage ?? device?.voltageLevel,
      address: device.address || t("deviceTracking.determiningAddress"),
      tracking_url: device.tracking_url,
      report_url: device.report_url,
    };

    setCars([initialCar]);
    setIsInit(true);

    if (position) {
      setInitialCenter(position);
      setRenderPos(position);
    }
  }, [data]);

  // ✅ WebSocket tracking (نفس منطق TenantDashboard) لجهاز واحد
  useCarSocket(cars, setCars, isInit);

  const car = cars[0] || null;
  const position = car?.position || null;

  // helper: مسافة تقريبية بالمتر
  const distanceMeters = (a, b) => {
    if (!a || !b) return 0;
    const R = 6371000;
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const aa =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
    return R * c;
  };

  const lerp = (a, b, t) => a + (b - a) * t;

  const isInSafeBounds = (map, pos, paddingRatio = 0.2) => {
    if (!map || !pos) return true;
    const bounds = map.getBounds();
    if (!bounds) return true;
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const latSpan = ne.lat() - sw.lat();
    const lngSpan = ne.lng() - sw.lng();
    if (latSpan <= 0 || lngSpan <= 0) return true;

    const safeSwLat = sw.lat() + latSpan * paddingRatio;
    const safeNeLat = ne.lat() - latSpan * paddingRatio;
    const safeSwLng = sw.lng() + lngSpan * paddingRatio;
    const safeNeLng = ne.lng() - lngSpan * paddingRatio;

    return (
      pos.lat >= safeSwLat &&
      pos.lat <= safeNeLat &&
      pos.lng >= safeSwLng &&
      pos.lng <= safeNeLng
    );
  };

  // ✅ حركة انيميشن من renderPos -> position كل ما تجي نقطة جديدة من السوكت
  useEffect(() => {
    if (!position) return;
    if (!renderPos) {
      setRenderPos(position);
      return;
    }

    const start = renderPos;
    const end = position;
    if (start.lat === end.lat && start.lng === end.lng) return;

    // مدة انيميشن حسب المسافة (clamp) لتجنب الاهتزاز
    const d = distanceMeters(start, end);
    const dur = Math.max(300, Math.min(1200, d * 6)); // 6ms لكل متر تقريبًا

    if (animRef.current.raf) cancelAnimationFrame(animRef.current.raf);
    animRef.current = { raf: 0, start, end, t0: performance.now(), dur };

    const tick = (now) => {
      const { start, end, t0, dur } = animRef.current;
      const t = Math.min(1, (now - t0) / dur);
      const next = { lat: lerp(start.lat, end.lat, t), lng: lerp(start.lng, end.lng, t) };
      setRenderPos(next);

      // ✅ لا نعيد تمركز الخريطة إلا لو السيارة وصلت للحافة (safe bounds)
      if (mapRef) {
        const panNow = now;
        if (panNow - lastPanCheckRef.current > 250 && !isInSafeBounds(mapRef, next, 0.2)) {
          lastPanCheckRef.current = panNow;
          mapRef.panTo(next);
        }
      }

      if (t < 1) {
        animRef.current.raf = requestAnimationFrame(tick);
      } else {
        animRef.current.raf = 0;
      }
    };

    animRef.current.raf = requestAnimationFrame(tick);
    return () => {
      if (animRef.current.raf) cancelAnimationFrame(animRef.current.raf);
      animRef.current.raf = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.lat, position?.lng]); // نتجنب تحريك الانيميشن بسبب تغييرات غير الموقع


  // جلب العنوان (تهدئة + فقط عند تحرك ملحوظ)
  useEffect(() => {
    if (!isLoaded || !window.google || !position) return;

    const lastPos = lastAddressPosRef.current;
    const distKm = lastPos
      ? (() => {
          const R = 6371;
          const toRad = (x) => (x * Math.PI) / 180;
          const dLat = toRad(position.lat - lastPos.lat);
          const dLng = toRad(position.lng - lastPos.lng);
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lastPos.lat)) *
              Math.cos(toRad(position.lat)) *
              Math.sin(dLng / 2) ** 2;
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          return R * c;
        })()
      : Infinity;

    const now = Date.now();
    if (now - lastGeocodeAtRef.current < 5000) return;
    if (distKm < 0.05) return; // ~50m

    lastGeocodeAtRef.current = now;
    lastAddressPosRef.current = { lat: position.lat, lng: position.lng };

    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: position }, (results, geocodeStatus) => {
      if (geocodeStatus === "OK" && results?.[0]?.formatted_address) {
        setAddress(results[0].formatted_address);
        setCars((prev) =>
          prev.length
            ? [{ ...prev[0], address: results[0].formatted_address }]
            : prev
        );
      }
    });
  }, [isLoaded, position?.lat, position?.lng]);

  if (loadError) return <div>{t("deviceTracking.mapLoadFailed")}</div>;
  if (!isLoaded) return <LoadingPage />;
  if (isLoading) return <LoadingPage />;
  if (isError || !data) return <div className="p-4">{t("deviceTracking.deviceDataLoadFailed")}</div>;
  if (!position) return <div className="p-4">{t("deviceTracking.noLocationAvailable")}</div>;

  return (
    <div className="relative">
      <div className="absolute top-3 start-3 z-20">
        <AlarmPoolBtn />
      </div>
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={initialCenter}
        zoom={16}
        onLoad={(m) => setMapRef(m)}
        onClick={() => setShowInfo(false)}
        options={{
          fullscreenControl: false,
          mapTypeControl: false,
          clickableIcons: false,
        }}
      >
        <Marker
          position={renderPos || position}
          onClick={() => setShowInfo(true)}
          icon={
            car
              ? {
                  path: carPath,
                  fillColor: getCarColor(car),
                  fillOpacity: 1,
                  strokeColor: "#000",
                  strokeWeight: 0.7,
                  scale: 0.05,
                  rotation: car.direction || 0,
                  anchor: new window.google.maps.Point(156, 256),
                  labelOrigin: new window.google.maps.Point(156, 700),
                }
              : undefined
          }
        />

        {showInfo && (
          <InfoWindow
            position={renderPos || position}
            onCloseClick={() => setShowInfo(false)}
            options={{ pixelOffset: new window.google.maps.Size(0, -40) }}
          >
            {/* نفس معلومات CarPopup ولكن بدون أزرار */}
            <CarPopup car={car} showActions={false} />
          </InfoWindow>
        )}
      </GoogleMap>
    </div>
  );
};

export default DeviceTracking;


