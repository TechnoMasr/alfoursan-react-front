import { useEffect, useRef, useState } from "react";
import {
  GoogleMap,
  InfoWindow,
  Marker,
  useLoadScript,
} from "@react-google-maps/api";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import LoadingPage from "../../components/Loading/LoadingPage";
import CarPopup from "../../components/common/CarPopup";
import useCarSocket from "../../hooks/useCarSocket";
import {
  getOutsideTracking,
  sendCommand,
} from "../../services/monitorServices";
import { toast } from "react-toastify";
import { carPath } from "../../services/carPath";
import { getCarStatus } from "../../utils/getCarStatus";
import { telemetryFromMongo } from "../../utils/deviceTelemetry";
import { useTranslation } from "react-i18next";

const containerStyle = { width: "100%", height: "100vh" };

const getCarColor = (car) => getCarStatus(car).color;

const formatTimeLeft = (ms, t) => {
  if (ms <= 0) return t("outsideTracking.linkExpired");
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
};

const OutsideTracking = () => {
  const { t } = useTranslation();
  const { id } = useParams(); // token أو id

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: "AIzaSyBuFc-F9K_-1QkQnLoTIecBlNz6LfCS1wg",
    language: "ar",
  });

  const lastGeocodeAtRef = useRef(0);
  const lastAddressPosRef = useRef(null);
  const [mapRef, setMapRef] = useState(null);
  const [initialCenter, setInitialCenter] = useState({
    lat: 23.8859,
    lng: 45.0792,
  });
  const [showInfo, setShowInfo] = useState(false);
  const [showCommandDialog, setShowCommandDialog] = useState(false);
  const [selectedCommand, setSelectedCommand] = useState("");

  const [cars, setCars] = useState([]);
  const [isInit, setIsInit] = useState(false);

  // animation
  const [renderPos, setRenderPos] = useState(null);
  const animRef = useRef({ raf: 0, start: null, end: null, t0: 0, dur: 0 });
  const lastPanCheckRef = useRef(0);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["outsideTracking", id],
    queryFn: () => getOutsideTracking(id),
    enabled: !!id,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const endAt = data?.endAt ? new Date(data.endAt).getTime() : null;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const isExpired = endAt ? now >= endAt : false;
  const timeLeft = endAt ? formatTimeLeft(endAt - now, t) : "";

  // init from API
  useEffect(() => {
    const device = data?.device;
    const status = device?.device_status ?? device?.deviceStatus ?? null;
    if (!device || !status) return;

    const lat = Number(status.last_lat);
    const lng = Number(status.last_lon);
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
      speed: Number(status.last_speed) || 0,
      direction: Number(status.last_direction) || 0,
      charge: status?.charge ?? device.charge ?? null,
      ignition_on: status?.ignition_on ?? device.ignition_on ?? null,
      motion: status?.motion ?? device.motion ?? null,
      ...telemetryFromMongo(status),
      lastSignel: status.last_packet_at || status.last_activity_at,
      lastSignelGPS: status.last_gps_at,
      voltageLevel:
        status.last_voltage_unit === "mv"
          ? `${(Number(status.last_voltage) / 1000).toFixed(2)} V`
          : status.last_voltage,
      address: device.address || t("outsideTracking.determiningAddress"),
      tracking_url: device.tracking_url,
      report_url: device.report_url,
    };

    setCars([initialCar]);
    setIsInit(true);
    setInitialCenter(position);
    setRenderPos(position);
  }, [data]);

  // Device-specific WS only for the share-resolved IMEI (Node subscribe by imei).
  // Same window.__WS_URL__. IMEI comes from Laravel-authorized getOutsideTracking.
  // Do not join tenant room. (Public WS IMEI auth is a known Node gap — out of scope.)
  useCarSocket(cars, setCars, isInit && !isExpired, {
    useTenantRoom: false,
    tag: "OutsideTracking",
  });

  const car = cars[0] || null;
  const position = car?.position || null;

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

  // smooth marker A->B + edge pan only
  useEffect(() => {
    if (!position) return;
    if (!renderPos) {
      setRenderPos(position);
      return;
    }
    const start = renderPos;
    const end = position;
    if (start.lat === end.lat && start.lng === end.lng) return;

    const d = distanceMeters(start, end);
    const dur = Math.max(300, Math.min(1200, d * 6));
    if (animRef.current.raf) cancelAnimationFrame(animRef.current.raf);
    animRef.current = { raf: 0, start, end, t0: performance.now(), dur };

    const tick = (now) => {
      const { start, end, t0, dur } = animRef.current;
      const t = Math.min(1, (now - t0) / dur);
      const next = {
        lat: lerp(start.lat, end.lat, t),
        lng: lerp(start.lng, end.lng, t),
      };
      setRenderPos(next);

      if (mapRef) {
        if (
          now - lastPanCheckRef.current > 250 &&
          !isInSafeBounds(mapRef, next, 0.2)
        ) {
          lastPanCheckRef.current = now;
          mapRef.panTo(next);
        }
      }

      if (t < 1) animRef.current.raf = requestAnimationFrame(tick);
      else animRef.current.raf = 0;
    };
    animRef.current.raf = requestAnimationFrame(tick);

    return () => {
      if (animRef.current.raf) cancelAnimationFrame(animRef.current.raf);
      animRef.current.raf = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.lat, position?.lng]);

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
        setCars((prev) =>
          prev.length
            ? [{ ...prev[0], address: results[0].formatted_address }]
            : prev,
        );
      }
    });
  }, [isLoaded, position?.lat, position?.lng]);

  const allowedCommands = data?.share?.commands || [];

  const { mutate: sendOutsideCommand, isPending: isSending } = useMutation({
    mutationFn: ({ device_id, command }) => sendCommand({ device_id, command }),
    onSuccess: () => {
      toast.success(t("outsideTracking.commandSentSuccess"));
      setShowCommandDialog(false);
      setSelectedCommand("");
    },
    onError: (error) => {
      toast.error(
        error?.response?.data?.message ||
          t("outsideTracking.commandSendFailed"),
      );
    },
  });

  const handleSendCommand = () => {
    if (isExpired) return toast.warn(t("outsideTracking.linkExpiredWarning"));
    if (!car?.id) return toast.warn(t("outsideTracking.noDeviceWarning"));
    if (!selectedCommand)
      return toast.warn(t("outsideTracking.selectCommandWarning"));
    sendOutsideCommand({ device_id: car.id, command: selectedCommand });
  };

  if (loadError) return <div>{t("outsideTracking.mapLoadFailed")}</div>;
  if (!isLoaded) return <LoadingPage />;
  if (isLoading) return <LoadingPage />;
  if (isError || !data)
    return (
      <div className="p-4">{t("outsideTracking.shareDataLoadFailed")}</div>
    );
  if (!position)
    return (
      <div className="p-4">{t("outsideTracking.noLocationAvailable")}</div>
    );

  return (
    <div className="relative">
      {/* شريط انتهاء الصلاحية */}
      {endAt && (
        <div className="absolute top-3 left-3 right-3 z-20">
          <div
            className={`px-3 py-2 rounded-xl text-sm shadow border ${
              isExpired
                ? "bg-red-50 border-red-200 text-red-700"
                : "bg-white/90 border-gray-200 text-gray-700"
            }`}
          >
            {isExpired
              ? t("outsideTracking.linkExpired")
              : `${t("outsideTracking.timeLeft")} ${timeLeft}`}
          </div>
        </div>
      )}

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
            <CarPopup car={car} showActions={false} />
          </InfoWindow>
        )}
      </GoogleMap>

      {/* زر إرسال الأوامر */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
        <button
          className="btn btn-primary btn-sm rounded-full px-5 shadow-lg"
          onClick={() => {
            if (isExpired)
              return toast.warn(t("outsideTracking.linkExpiredWarning"));
            setShowCommandDialog(true);
          }}
          disabled={isExpired}
        >
          {t("outsideTracking.sendCommand")}
        </button>
      </div>

      {/* Dialog الأوامر */}
      {showCommandDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowCommandDialog(false)}
          />
          <div className="relative bg-white w-[92vw] max-w-md rounded-2xl shadow-xl p-4">
            <h3 className="font-bold text-sm mb-3">
              {t("outsideTracking.sendCommandToDevice")}
            </h3>

            <label className="text-xs text-gray-600">
              {t("outsideTracking.availableCommands")}
            </label>
            <select
              className="select select-bordered w-full mt-1"
              value={selectedCommand}
              onChange={(e) => setSelectedCommand(e.target.value)}
            >
              <option value="">{t("outsideTracking.selectCommand")}</option>
              {allowedCommands.map((c, idx) => (
                <option key={`${c.key}-${idx}`} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>

            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowCommandDialog(false)}
              >
                {t("outsideTracking.cancel")}
              </button>
              <button
                className="btn btn-success btn-sm"
                onClick={handleSendCommand}
                disabled={isSending || !selectedCommand || isExpired}
              >
                {isSending
                  ? t("outsideTracking.sending")
                  : t("outsideTracking.send")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OutsideTracking;
