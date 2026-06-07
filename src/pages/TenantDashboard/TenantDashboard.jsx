import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLoadScript } from "@react-google-maps/api";
import "mapbox-gl/dist/mapbox-gl.css";
import SideMenu from "./SideMenu/SideMenu";
import GoogleMapView from "./Maps/GoogleMapView";
import MapboxMapView from "./Maps/MapboxMapView";
import OpenStreetMapView from "./Maps/OpenStreetMapView";
import MapLibreMapView from "./Maps/MapLibreMapView";
import MapTilerMapView from "./Maps/MapTilerMapView";
import { getMapTilerApiKey } from "./Maps/mapTilerConfig";
import { useQuery } from "@tanstack/react-query";
import useCarSocket from "../../hooks/useCarSocket";
import { mergeTelemetry } from "../../utils/deviceTelemetry";
import {
  initFleetFromCars,
  mergeCarsWithFleet,
  subscribeFleetList,
} from "../../utils/fleetPositionStore";
import LoadingPage from "../../components/Loading/LoadingPage";
import MapActions from "./MapActions/MapActions";
import { useDispatch, useSelector } from "react-redux";
import { getDevices } from "../../services/monitorServices";
import { toast } from "react-toastify";
import DetailsModal from "../../components/modals/DetailsModal/DetailsModal";
import ShareModal from "../../components/modals/ShareModal";
import GeoFenceModal from "../../components/modals/GeoFenceModal";
import AssociateDevice from "../../components/modals/AssociateDevice";
import SupportModal from "../../components/modals/SupportModal";
import { changeZoom } from "../../store/mapSlice";
import { useTranslation } from "react-i18next";
import { takePendingGoogleDraw } from "../../utils/pendingGoogleDraw";

const VECTOR_MAP_PROVIDERS = ["mapbox", "maplibre", "maptiler"];

// ✅ ثابت خارج الـ component لمنع إعادة تحميل Google Maps
const libraries = ["drawing", "geometry", "marker"];
const MAPBOX_TOKEN = "";

class MapRuntimeErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error) {
    console.error("[TenantDashboardMap]", error);
  }

  resetMapPreferences = () => {
    localStorage.setItem("mapProvider", "google");
    localStorage.setItem("mapType", "roadmap");
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-50 p-4 text-center">
        <div className="max-w-md rounded-2xl bg-white p-5 shadow-xl">
          <h2 className="mb-2 text-lg font-bold text-slate-900">
            حدث خطأ أثناء تحميل الخريطة
          </h2>
          <p className="mb-4 text-sm text-slate-600">
            {this.state.error?.message || "تعذر تحميل مزود الخريطة الحالي."}
          </p>
          <button
            type="button"
            onClick={this.resetMapPreferences}
            className="rounded-lg bg-mainColor px-4 py-2 text-sm font-bold text-white"
          >
            إعادة ضبط الخريطة
          </button>
        </div>
      </div>
    );
  }
}

// 🧮 دالة حساب المسافة بين نقطتين (كم)
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const TenantDashboard = () => {
  const { t } = useTranslation();
  const { data: devices, isFetching } = useQuery({
    queryKey: ["devices", { full: false }],
    queryFn: getDevices,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // 🔁 استعلام تاني بدون loading (silent update)
  const { refetch: refetchFullDevices } = useQuery({
    queryKey: ["devices", { full: true }],
    queryFn: getDevices,
    enabled: false, // مش هيشتغل إلا لما نطلبه
  });

  const {
    detailsModal,
    shareModal,
    geoFenceModal,
    associateDeviceModal,
    supportModal,
  } = useSelector((state) => state.modals);
  const { provider: mapProvider, zoom } = useSelector((state) => state.map);

  const [cars, setCars] = useState([]);
  const [fleetVersion, setFleetVersion] = useState(0);
  const [isInit, setIsInit] = useState(false);
  const [center, setCenter] = useState({ lat: 23.8859, lng: 41.0792 });
  // const [zoom, setZoom] = useState(6);
  const [selectedCarId, setSelectedCarId] = useState(null);
  const [selectionTrigger, setSelectionTrigger] = useState(0);
  const [activeFilter, setActiveFilter] = useState("all");
  const [activeBranchId, setActiveBranchId] = useState("");
  const dispatch = useDispatch();
  const lastGeocodeAtRef = useRef(new Map());
  /** يُحدَّث من handleSelectCar — لاستدعائه من useCarSocket دون تغيير ترتيب الـ hooks */
  const handleSelectCarRef = useRef(null);

  const mapDeviceToCar = useCallback((d) => {
    const lat = parseFloat(d.latitude);
    const lng = parseFloat(d.longitude);
    const hasPos = Number.isFinite(lat) && Number.isFinite(lng);

    return {
      ...d,
      position: hasPos ? { lat, lng } : d.position,
      address: d.address || "جارٍ التحديد...",
      // ✅ تحكم في معدل تحديث العنوان (يُستخدم لعرض countdown في الـ UI)
      addressMinIntervalMs: 30_000,
      // lastUpdate: لو جاية من socket نخليها، ولو جاية من API بس نديها قيمة
      lastUpdate: d.lastUpdate || Date.now(),
    };
  }, []);

  const mergeCarsPreferLive = useCallback((prevCars, incomingCars) => {
    const prevById = new Map();
    const prevByImei = new Map();
    (prevCars || []).forEach((c) => {
      if (c?.id != null) prevById.set(c.id, c);
      if (c?.serial_number) prevByImei.set(c.serial_number, c);
    });

    const incomingById = new Map();
    (incomingCars || []).forEach((c) => {
      if (c?.id == null) return;
      incomingById.set(c.id, c); // dedupe by id
    });

    const now = Date.now();
    const merged = [];
    incomingById.forEach((incoming) => {
      const prev =
        prevById.get(incoming.id) || prevByImei.get(incoming.serial_number);
      if (!prev) {
        merged.push(incoming);
        return;
      }

      // ✅ لا تقتل موقع/سرعة socket الحديثة عند وصول API (خصوصًا full=1)
      const prevIsLive = prev.lastUpdate && now - prev.lastUpdate < 60_000;

      merged.push({
        ...incoming,
        ...prev,
        // بيانات الجهاز من API لازم تكسب (اسم/هاتف/صورة/روابط...)
        ...incoming,
        // لكن بيانات التتبع الحديثة من socket ما تتغيرش
        position:
          prevIsLive && prev.position ? prev.position : incoming.position,
        speed: prevIsLive && prev.speed != null ? prev.speed : incoming.speed,
        direction:
          prevIsLive && prev.direction != null
            ? prev.direction
            : incoming.direction,
        status:
          prevIsLive && prev.status != null ? prev.status : incoming.status,
        lastUpdate: prev.lastUpdate || incoming.lastUpdate,
        lastSignel: prev.lastSignel || incoming.lastSignel,
        lastSignelGPS: prev.lastSignelGPS || incoming.lastSignelGPS,
        lastGpsAtMs: prev.lastGpsAtMs || incoming.lastGpsAtMs,
        ...mergeTelemetry(prev, incoming),
        charge:
          prevIsLive && prev.charge != null ? prev.charge : incoming.charge,
      });
    });

    return merged;
  }, []);

  useEffect(() => subscribeFleetList(setFleetVersion), []);

  const carsWithLive = useMemo(
    () => mergeCarsWithFleet(cars),
    [cars, fleetVersion],
  );

  const branches = useMemo(() => {
    const map = new Map();
    (carsWithLive || []).forEach((c) => {
      const id = c?.branch_effective_id ?? null;
      const name = c?.branch_effective_name ?? null;
      if (id != null && name) {
        map.set(String(id), { id: String(id), name: String(name) });
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "ar"),
    );
  }, [carsWithLive]);

  // سيارات مفلترة بالفرع فقط (تُمرَّر للـ Filters و Search لتعكس الخيارات والأعداد حسب الفرع)
  const carsByBranch = useMemo(() => {
    if (!activeBranchId) return carsWithLive || [];
    return (carsWithLive || []).filter((car) => {
      const carBranchId =
        car?.branch_effective_id != null ? String(car.branch_effective_id) : "";
      return carBranchId === String(activeBranchId);
    });
  }, [carsWithLive, activeBranchId]);

  const filteredCars = useMemo(() => {
    return carsByBranch.filter((car) => {
      if (activeFilter === "all") return true;
      if (activeFilter === "inactive") return !!car.isInactive;
      if (activeFilter === "online") return !car.isOffline && !car.isInactive;
      if (activeFilter === "offline") return !!car.isOffline && !car.isInactive;
      if (activeFilter === "moving") {
        return !car.isOffline && !car.isInactive && Number(car.speed) > 0;
      }
      return true;
    });
  }, [carsByBranch, activeFilter]);

  const [viewState, setViewState] = useState({
    longitude: center.lng,
    latitude: center.lat,
    zoom: 7,
  });

  const prevMapProviderRef = useRef(mapProvider);
  const viewStateRef = useRef(viewState);
  const centerRef = useRef(center);
  viewStateRef.current = viewState;
  centerRef.current = center;

  // ✅ عند التبديل من Mapbox/MapLibre/MapTiler إلى Google: مزامنة المركز والتكبير
  useEffect(() => {
    const prev = prevMapProviderRef.current;
    prevMapProviderRef.current = mapProvider;
    if (prev === mapProvider) return;

    if (
      mapProvider === "google" &&
      VECTOR_MAP_PROVIDERS.includes(prev)
    ) {
      const vs = viewStateRef.current;
      if (Number.isFinite(vs.latitude) && Number.isFinite(vs.longitude)) {
        setCenter({ lat: vs.latitude, lng: vs.longitude });
      }
      if (Number.isFinite(vs.zoom)) {
        dispatch(changeZoom(Math.round(vs.zoom)));
      }
    }

    if (
      VECTOR_MAP_PROVIDERS.includes(mapProvider) &&
      prev === "google"
    ) {
      const c = centerRef.current;
      setViewState((v) => ({
        ...v,
        latitude: c.lat,
        longitude: c.lng,
        zoom,
      }));
    }
  }, [mapProvider, zoom, dispatch]);

  // ✅ مزامنة zoom القادم من Redux مع Mapbox / MapLibre / MapTiler viewState
  useEffect(() => {
    if (
      mapProvider !== "mapbox" &&
      mapProvider !== "maplibre" &&
      mapProvider !== "maptiler"
    )
      return;
    setViewState((v) => (v.zoom === zoom ? v : { ...v, zoom }));
  }, [mapProvider, zoom]);

  // ✅ تحميل سكريبت Google Maps مرة واحدة فقط
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: "AIzaSyBuFc-F9K_-1QkQnLoTIecBlNz6LfCS1wg",
    language: "ar",
    libraries,
  });

  // ✅ بعد التبديل إلى Google: استئناف الرسم إن كان المستخدم قد طلبه من التنبيه
  useEffect(() => {
    if (mapProvider !== "google" || !isLoaded) return;
    const drawType = takePendingGoogleDraw();
    if (!drawType) return;

    const timer = window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("start-drawing", { detail: { type: drawType } }),
      );
    }, 300);

    return () => window.clearTimeout(timer);
  }, [mapProvider, isLoaded]);

  // 🧩 عند تحميل الأجهزة
  useEffect(() => {
    if (devices) {
      const mappedCars = (devices?.devices || []).map(mapDeviceToCar);
      setCars((prev) => mergeCarsPreferLive(prev, mappedCars));
      initFleetFromCars(mappedCars);
      setIsInit(true);

      // 🔁 بعدها اضرب API تانية بـ full=1 (بدون لودينج)
      refetchFullDevices().then((res) => {
        const fullDevices = res.data?.devices;
        if (fullDevices) {
          const updatedCars = fullDevices.map(mapDeviceToCar);
          setCars((prev) => mergeCarsPreferLive(prev, updatedCars));
          initFleetFromCars(updatedCars);
        }
      });
    }
  }, [devices, refetchFullDevices, mapDeviceToCar, mergeCarsPreferLive]);

  // ✅ تحديث بيانات المركبة بعد updateDialogCar (من المودال) باستخدام استجابة API
  useEffect(() => {
    const handler = (e) => {
      const device = e?.detail?.device || null;
      if (!device?.id) return;

      setCars((prev) =>
        (prev || []).map((c) => {
          if (c?.id !== device.id) return c;
          // لا تغيّر position/speed/direction الحالية (socket) — فقط حدّث بيانات الجهاز
          return {
            ...c,
            ...device,
          };
        }),
      );
    };

    window.addEventListener("device-updated", handler);
    return () => window.removeEventListener("device-updated", handler);
  }, []);

  // 🔍 دوال العنوان (Google / Mapbox)
  const getGoogleAddress = (lat, lng, cb) => {
    if (!window.google) return cb(t("tenantDashboard.addressUnavailable"));
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === "OK" && results[0]) cb(results[0].formatted_address);
      else cb(t("tenantDashboard.addressNotFound"));
    });
  };

  const getOsmAddress = async (lat, lng, cb) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ar`,
        { headers: { "Accept-Language": "ar" } },
      );
      const data = await res.json();
      if (data?.display_name) cb(data.display_name);
      else cb(t("tenantDashboard.addressNotFound"));
    } catch (err) {
      console.error(err);
      cb(t("tenantDashboard.addressError"));
    }
  };

  const getMapTilerAddress = async (lat, lng, cb) => {
    try {
      const key = getMapTilerApiKey();
      const res = await fetch(
        `https://api.maptiler.com/geocoding/${lng},${lat}.json?key=${key}&language=ar`,
      );
      const data = await res.json();
      const place = data?.features?.[0]?.place_name;
      if (place) cb(place);
      else cb(t("tenantDashboard.addressNotFound"));
    } catch (err) {
      console.error(err);
      cb(t("tenantDashboard.addressError"));
    }
  };

  const getMapboxAddress = async (lat, lng, cb) => {
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&language=ar`,
      );
      const data = await res.json();
      if (data.features?.length) cb(data.features[0].place_name);
      else cb(t("tenantDashboard.addressNotFound"));
    } catch (err) {
      console.error(err);
      cb(t("tenantDashboard.addressError"));
    }
  };

  const onAlarmSelectCarFromSocket = useCallback((car, shouldZoom) => {
    handleSelectCarRef.current?.(car, shouldZoom);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      const { imei, carId } = e.detail || {};
      const car =
        (carId != null && carsWithLive.find((c) => c?.id === carId)) ||
        (imei &&
          carsWithLive.find((c) => String(c?.serial_number) === String(imei)));
      if (car) handleSelectCarRef.current?.(car, true);
    };
    window.addEventListener("alarm-go-to-map", handler);
    return () => window.removeEventListener("alarm-go-to-map", handler);
  }, [carsWithLive]);

  // 🔌 WebSocket hook لتحديث العربيات (اتصال ثابت بدون socketRefresh)
  useCarSocket(cars, setCars, isInit, {
    debug: import.meta.env.DEV,
    tag: "TenantDashboard",
    onAlarmSelectCar: onAlarmSelectCarFromSocket,
    // useTenantRoom: يُقرأ من window.__USE_TENANT_ROOM__ في index.html / monitoring.blade.php
    useFleetStore: true,
    updateCarsOnGps: false,
  });

  // 🧭 تحديث العنوان عند تحرك العربية
  const selectedCar = useMemo(
    () => carsWithLive.find((c) => c.id === selectedCarId) || null,
    [carsWithLive, selectedCarId],
  );

  useEffect(() => {
    if (!selectedCarId || !selectedCar?.position) return;
    const { lat, lng } = selectedCar.position;
    const MIN_GEOCODE_INTERVAL_MS =
      typeof selectedCar.addressMinIntervalMs === "number"
        ? selectedCar.addressMinIntervalMs
        : 30_000; // ✅ لا تطلب عنوان أقل من كل 30 ثانية (لتقليل التكلفة)

    if (
      !selectedCar.lastAddressPos ||
      haversineDistance(
        selectedCar.lastAddressPos.lat,
        selectedCar.lastAddressPos.lng,
        lat,
        lng,
      ) > 0.05
    ) {
      // ✅ تهدئة طلبات العنوان (reverse geocoding) عشان ما تأثرش على سلاسة الصفحة
      const now = Date.now();
      const last = lastGeocodeAtRef.current.get(selectedCarId) || 0;
      if (now - last < MIN_GEOCODE_INTERVAL_MS) return;
      lastGeocodeAtRef.current.set(selectedCarId, now);
      // ✅ نخزن وقت آخر طلب (لـ countdown) بدون انتظار نتيجة الـ geocode
      setCars((prev) =>
        (prev || []).map((c) =>
          c?.id === selectedCarId
            ? c?.lastGeocodeAtMs === now &&
              c?.addressMinIntervalMs === MIN_GEOCODE_INTERVAL_MS
              ? c
              : {
                  ...c,
                  lastGeocodeAtMs: now,
                  addressMinIntervalMs: MIN_GEOCODE_INTERVAL_MS,
                }
            : c,
        ),
      );

      const updateAddress = (addr) => {
        setCars((prev) =>
          prev.map((c) =>
            c.id === selectedCarId
              ? c.address === addr &&
                c.lastAddressPos?.lat === lat &&
                c.lastAddressPos?.lng === lng
                ? c
                : { ...c, address: addr, lastAddressPos: { lat, lng } }
              : c,
          ),
        );
      };
      if (mapProvider === "google") getGoogleAddress(lat, lng, updateAddress);
      else if (mapProvider === "maptiler")
        getMapTilerAddress(lat, lng, updateAddress);
      else if (
        mapProvider === "openstreetmap" ||
        mapProvider === "maplibre"
      )
        getOsmAddress(lat, lng, updateAddress);
      else getMapboxAddress(lat, lng, updateAddress);
    }
  }, [
    mapProvider,
    selectedCarId,
    selectedCar?.position?.lat,
    selectedCar?.position?.lng,
    selectedCar?.lastAddressPos?.lat,
    selectedCar?.lastAddressPos?.lng,
  ]);

  // 🚗 اختيار عربية من القائمة
  const handleSelectCar = useCallback(
    (car, shouldZoom = false) => {
      if (!car) return setSelectedCarId(null);

      const { position } = car;
      const { lat, lng } = position || {};

      const hasValidPosition =
        position &&
        typeof lat === "number" &&
        typeof lng === "number" &&
        !isNaN(lat) &&
        !isNaN(lng);

      // ✅ العربية تبقى active حتى لو مفيش location
      setSelectedCarId(car.id);
      setSelectionTrigger(Date.now());

      if (!hasValidPosition) {
        toast.warning(t("tenantDashboard.locationUnavailable"));
        return;
      }

      if (shouldZoom) {
        setCenter(position);
        dispatch(changeZoom(18));

        if (
          mapProvider === "mapbox" ||
          mapProvider === "maplibre" ||
          mapProvider === "maptiler"
        ) {
          setViewState({
            longitude: lng,
            latitude: lat,
            zoom: 18,
          });
        }
      }
    },
    [dispatch, mapProvider, t],
  );

  useEffect(() => {
    handleSelectCarRef.current = handleSelectCar;
  }, [handleSelectCar]);

  if (loadError) return <div>{t("tenantDashboard.mapLoadError")}</div>;
  if (!isLoaded && mapProvider === "google") return <LoadingPage />;

  return (
    <section className="w-screen h-screen relative overflow-hidden">
      <SideMenu
        cars={carsWithLive}
        carsByBranch={carsByBranch}
        filteredCars={filteredCars}
        isFetching={isFetching}
        handleSelectCar={handleSelectCar}
        selectedCarId={selectedCarId}
        selectionTrigger={selectionTrigger}
        activeFilter={activeFilter}
        setActiveFilter={setActiveFilter}
        branches={branches}
        activeBranchId={activeBranchId}
        setActiveBranchId={setActiveBranchId}
      />

      <MapActions setViewState={setViewState} />

      <MapRuntimeErrorBoundary resetKey={mapProvider}>
        {mapProvider === "google" && (
          <GoogleMapView
            cars={filteredCars}
            fleetVersion={fleetVersion}
            center={center}
            zoom={zoom}
            selectedCarId={selectedCarId}
            handleSelectCar={handleSelectCar}
          />
        )}
        {mapProvider === "mapbox" && (
          <MapboxMapView
            cars={filteredCars}
            fleetVersion={fleetVersion}
            viewState={viewState}
            setViewState={setViewState}
            MAPBOX_TOKEN={MAPBOX_TOKEN}
            selectedCarId={selectedCarId}
            handleSelectCar={handleSelectCar}
          />
        )}
        {mapProvider === "openstreetmap" && (
          <OpenStreetMapView
            cars={filteredCars}
            fleetVersion={fleetVersion}
            center={center}
            zoom={zoom}
            selectedCarId={selectedCarId}
            handleSelectCar={handleSelectCar}
          />
        )}
        {mapProvider === "maplibre" && (
          <MapLibreMapView
            cars={filteredCars}
            fleetVersion={fleetVersion}
            viewState={viewState}
            setViewState={setViewState}
            selectedCarId={selectedCarId}
            handleSelectCar={handleSelectCar}
          />
        )}
        {mapProvider === "maptiler" && (
          <MapTilerMapView
            cars={filteredCars}
            fleetVersion={fleetVersion}
            viewState={viewState}
            setViewState={setViewState}
            selectedCarId={selectedCarId}
            handleSelectCar={handleSelectCar}
          />
        )}
      </MapRuntimeErrorBoundary>

      {/* 🔹 Modals */}
      {detailsModal.show && <DetailsModal />}

      {shareModal.show && <ShareModal />}

      {geoFenceModal.show && <GeoFenceModal />}

      {associateDeviceModal.show && <AssociateDevice />}

      {supportModal.show && <SupportModal />}
    </section>
  );
};

export default TenantDashboard;
