import {
  FaMapMarkerAlt,
  FaPlane,
  FaPlaneSlash,
  FaSatelliteDish,
  FaUser,
} from "react-icons/fa";
import {
  FiActivity,
  FiBarChart2,
  FiMenu,
  FiNavigation,
  FiPlayCircle,
  FiShare2,
  FiUser,
  FiWifi,
} from "react-icons/fi";
import { ImLocation2 } from "react-icons/im";
import { HiOutlineCommandLine } from "react-icons/hi2";
import { IoSpeedometerSharp } from "react-icons/io5";
import {
  MdOutlineCarCrash,
  MdOutlineElectricBolt,
  MdOutlinePowerSettingsNew,
} from "react-icons/md";
import { getCarStatus } from "../../utils/getCarStatus";
import { useDispatch } from "react-redux";
import {
  openDetailsModal,
  openPolygonMenu,
  openShareModal,
} from "../../store/modalsSlice";
import { PiPhoneCall, PiPolygon } from "react-icons/pi";
import { Link } from "react-router-dom";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { GiPathDistance } from "react-icons/gi";
import { formatTelemetryDisplay } from "../../utils/deviceTelemetry";

const CarPopup = memo(function CarPopup({ car, showActions = true }) {
  const { t } = useTranslation();
  const { status, color } = getCarStatus(car);

  const formatDate = (isoString) => {
    if (!isoString) return t("carPopup.noData");
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return t("carPopup.noData");
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const formatBoolLabel = (value, onLabel, offLabel) => {
    if (value === null || value === undefined) return t("carPopup.noData");
    return value ? onLabel : offLabel;
  };

  const carDetails = [
    { label: formatDate(car.lastSignel), icon: <FaSatelliteDish /> },
    { label: t("carPopup.wired"), icon: <FiWifi /> },
    { label: formatDate(car.lastSignelGPS), icon: <ImLocation2 /> },
    { label: status, icon: <MdOutlineCarCrash /> },
    {
      label: formatBoolLabel(
        car?.ignition_on,
        t("carPopup.on"),
        t("carPopup.off"),
      ),
      icon: (
        <MdOutlinePowerSettingsNew
          style={{ color: car?.ignition_on ? "#22c55e" : "#ef4444" }}
        />
      ),
    },
    {
      label: formatBoolLabel(
        car?.motion,
        t("carPopup.moving"),
        t("carPopup.stopped"),
      ),
      icon: (
        <FiActivity style={{ color: car?.motion ? "#22c55e" : "#9ca3af" }} />
      ),
    },
    { label: car.iccid, icon: `iccid`, colSpan: 2 },
    { label: car.contact_person, icon: <FaUser /> },
    { label: car.contact_phone, icon: <PiPhoneCall /> },
    {
      label: `${Number(car?.display_km_total).toFixed(2)} km`,
      icon: <GiPathDistance />,
    },
  ];

  const dispatch = useDispatch();

  return (
    <div className="bg-gradient-to-br from-white via-slate-50 to-white rounded-2xl shadow-xl border border-slate-200/70 w-[520px] max-w-[98vw] overflow-hidden">
      <div className="px-4 py-2 flex items-center justify-between gap-3 bg-white/70 backdrop-blur border-b border-slate-100">
        <div className="min-w-0">
          <h4 className="font-bold text-sm text-slate-900 line-clamp-1">
            {car.name}
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
            {car.carnum || car.serial_number || t("carPopup.noData")}
          </p>
        </div>
        <span
          className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-slate-200 bg-white shadow-sm whitespace-nowrap"
          style={{ color }}
        >
          {status}
        </span>
      </div>

      <div className="px-4 pt-2 pb-2">
        <div className="grid grid-cols-3 gap-1.5">
          {carDetails.map((detail, index) => (
            <div
              key={index}
              className={`flex items-center gap-1.5 rounded-xl border border-slate-100 bg-white/80 px-2 py-1 shadow-sm ${
                detail.colSpan === 2 ? "col-span-2" : ""
              }`}
            >
              <span className="text-base text-slate-400 bg-slate-50 border border-slate-100 rounded-lg p-1.5">
                {detail.icon}
              </span>
              <p className="text-slate-700 text-[11px] font-medium leading-snug break-words">
                {detail.label || t("carPopup.noData")}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 pb-2">
        <div className="rounded-xl border border-amber-100/80 bg-gradient-to-l from-amber-50/60 to-white px-3 py-2 shadow-sm">
          <p className="text-[10px] font-semibold text-slate-500 mb-1.5">
            {t("carPopup.powerBattery")}
          </p>
          <div className="grid grid-cols-3 gap-1.5 text-[11px]">
            <div className="rounded-lg border border-slate-100 bg-white/90 px-2 py-1.5">
              <span className="text-slate-400 block text-[10px]">
                {t("carPopup.externalPower")}
              </span>
              <span className="font-bold text-slate-800 tabular-nums">
                {formatTelemetryDisplay(
                  "power",
                  car?.power,
                  t("carPopup.noData"),
                )}
              </span>
            </div>
            <div className="rounded-lg border border-slate-100 bg-white/90 px-2 py-1.5">
              <span className="text-slate-400 block text-[10px]">
                {t("carPopup.internalBattery")}
              </span>
              <span className="font-bold text-slate-800 tabular-nums">
                {formatTelemetryDisplay(
                  "battery",
                  car?.battery,
                  t("carPopup.noData"),
                )}
              </span>
            </div>
            <div className="rounded-lg border border-slate-100 bg-white/90 px-2 py-1.5">
              <span className="text-slate-400 block text-[10px]">
                {t("carPopup.batteryLevel")}
              </span>
              <span className="font-bold text-slate-800 tabular-nums">
                {formatTelemetryDisplay(
                  "batteryLevel",
                  car?.batteryLevel,
                  t("carPopup.noData"),
                )}
              </span>
            </div>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-slate-100 bg-white/90 px-2 py-1">
            <MdOutlineElectricBolt
              className="text-base shrink-0"
              style={{ color: car?.charge ? "#f59e0b" : "#9ca3af" }}
            />
            <span className="text-[11px] font-medium text-slate-700">
              {formatBoolLabel(
                car?.charge,
                t("carPopup.charging"),
                t("carPopup.notCharging"),
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 pb-2">
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${car.position.lat},${car.position.lng}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-start gap-2 rounded-xl border border-slate-100 
          bg-slate-50 px-3 py-1 hover:bg-slate-100 transition w-fit"
        >
          <span className="text-mainColor text-base mt-0.5">
            <FaMapMarkerAlt />
          </span>
          <p className="text-slate-600 font-medium text-xs line-clamp-2">
            {car.address}
          </p>
        </a>
      </div>

      {showActions && (
        <div className="px-4 pb-3">
          <div className="grid grid-cols-8 gap-2 text-lg">
            <button
              type="button"
              title={t("carPopup.details")}
              onClick={() =>
                dispatch(openDetailsModal({ section: "", id: car.id }))
              }
              className="btn"
            >
              <FiMenu />
            </button>

            <a
              href={car.tracking_url}
              target="_blank"
              rel="noreferrer"
              title={t("carPopup.tracking")}
              className="btn"
            >
              <FiNavigation />
            </a>

            <Link
              to={`/car-replay/${car.serial_number}`}
              target="_blank"
              title={t("carPopup.playback")}
              className="btn"
            >
              <FiPlayCircle />
            </Link>

            <button
              title={t("carPopup.commands")}
              onClick={() =>
                dispatch(openDetailsModal({ section: "command", id: car.id }))
              }
              className="btn"
            >
              <HiOutlineCommandLine />
            </button>

            <button
              title={t("carPopup.fence")}
              onClick={() => dispatch(openPolygonMenu())}
              className="btn"
            >
              <PiPolygon />
            </button>

            <a
              href={`https://www.google.com/maps/search/?api=1&query=${car.position.lat},${car.position.lng}`}
              target="_blank"
              rel="noreferrer"
              title={t("carPopup.streetView")}
              className="btn"
            >
              <FiUser />
            </a>

            <a
              href={car.report_url}
              target="_blank"
              rel="noreferrer"
              title={t("carPopup.reports")}
              className="btn"
            >
              <FiBarChart2 />
            </a>

            <button
              title={t("carPopup.share")}
              onClick={() => dispatch(openShareModal(car.serial_number))}
              className="btn"
            >
              <FiShare2 />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

export default CarPopup;
