import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { BsThreeDotsVertical } from "react-icons/bs";
import {
  openDetailsModal,
  openPolygonMenu,
  openShareModal,
} from "../../../../store/modalsSlice";
import { memo, useEffect, useMemo, useRef } from "react";
import { useDispatch } from "react-redux";
import Loader from "../../../../components/Loading/Loader";
import { getCarStatus } from "../../../../utils/getCarStatus";
import { parseTelemetryNumber } from "../../../../utils/deviceTelemetry";
import { Link } from "react-router-dom";
import { MdOutlinePowerSettingsNew } from "react-icons/md";
import { useTranslation } from "react-i18next";

const CarRow = memo(function CarRow({
  car,
  isSelected,
  handleSelectCar,
  selectionTrigger,
}) {
  const dispatch = useDispatch();
  const { t } = useTranslation();
  const { status, color } = useMemo(() => getCarStatus(car), [car]);

  const rowRef = useRef(null);

  useEffect(() => {
    if (isSelected && rowRef.current) {
      rowRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  // }, [isSelected]);
  }, [isSelected, selectionTrigger]);

  const speedVal = Number(car?.speed) || 0;
  const ignitionAsMoving = speedVal > 1;
  const effectiveIgnitionOn = ignitionAsMoving ? true : car?.ignition_on;

  const lat = car?.position?.lat;
  const lng = car?.position?.lng;
  const powerV = parseTelemetryNumber(car?.power);
  const powerLabel =
    powerV != null
      ? Number.isInteger(powerV) || powerV >= 10
        ? String(Math.round(powerV))
        : powerV.toFixed(1)
      : null;

  return (
    <div
      ref={rowRef}
      className="relative flex items-center gap-1 hover:bg-gray-400/10 rounded-lg"
      style={{
        color,
        backgroundColor: isSelected && "rgba(0, 0, 255, 0.1)",
      }}
    >
      <div
        onClick={() => handleSelectCar(car, true)}
        className="flex items-center justify-between gap-3 flex-1 p-2 text-xs cursor-pointer"
      >
        <span className="flex items-center gap-1.5 flex-1 min-w-0">
          <span
            className="text-[12px]"
            title={
              effectiveIgnitionOn == null
                ? t("carsList.ignitionUnknown")
                : effectiveIgnitionOn
                  ? t("carsList.ignitionOn")
                  : t("carsList.ignitionOff")
            }
            style={{
              color: effectiveIgnitionOn
                ? "#22c55e"
                : effectiveIgnitionOn === false
                  ? "#ef4444"
                  : "#9ca3af",
            }}
          >
            <MdOutlinePowerSettingsNew />
          </span>
          <span className="line-clamp-1 min-w-0">{car.name}</span>
          {powerLabel != null && (
            <span
              className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full border border-amber-300/90 bg-amber-50 text-[9px] font-bold leading-none text-amber-900 tabular-nums shadow-sm"
              title={t("carsList.powerVoltage", { value: powerLabel })}
            >
              {powerLabel} v
            </span>
          )}
        </span>
        <span>{status}</span>
      </div>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <span className="cursor-pointer text-gray-600 hover:text-mainColor p-2">
            <BsThreeDotsVertical />
          </span>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="bg-white shadow-xl rounded-lg p-2 flex flex-col z-50 radix-dropdown"
            sideOffset={5}
            align="start"
          >
            <DropdownMenu.Item
              className="p-1 cursor-pointer hover:bg-mainColor/10 hover:text-mainColor text-sm"
              onSelect={() =>
                dispatch(openDetailsModal({ section: "", id: car.id }))
              }
            >
              {t("carsList.details")}
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild>
              <a
                href={car.tracking_url}
                target="_blank"
                rel="noreferrer"
                className="p-1 cursor-pointer hover:bg-mainColor/10 hover:text-mainColor text-sm"
              >
                {t("carsList.tracking")}
              </a>
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild>
              <Link
                to={`/car-replay/${car.serial_number}`}
                target="_blank"
                rel="noreferrer"
                className="p-1 cursor-pointer hover:bg-mainColor/10 hover:text-mainColor text-sm"
              >
                {t("carsList.playback")}
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="p-1 cursor-pointer hover:bg-mainColor/10 hover:text-mainColor text-sm"
              onSelect={() =>
                dispatch(openDetailsModal({ section: "command", id: car.id }))
              }
            >
              {t("carsList.command")}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="p-1 cursor-pointer hover:bg-mainColor/10 hover:text-mainColor text-sm"
              onSelect={() => dispatch(openPolygonMenu())}
            >
              {t("carsList.fence")}
            </DropdownMenu.Item>
            {typeof lat === "number" && typeof lng === "number" && (
              <DropdownMenu.Item asChild>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1 cursor-pointer hover:bg-mainColor/10 hover:text-mainColor text-sm"
                >
                  {t("carsList.streetView")}
                </a>
              </DropdownMenu.Item>
            )}
            <DropdownMenu.Item asChild>
              <a
                href={car.report_url}
                target="_blank"
                rel="noreferrer"
                className="p-1 cursor-pointer hover:bg-mainColor/10 hover:text-mainColor text-sm"
              >
                {t("carsList.reports")}
              </a>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="p-1 cursor-pointer hover:bg-mainColor/10 hover:text-mainColor text-sm"
              onClick={() => dispatch(openShareModal(car.serial_number))}
            >
              {t("carsList.share")}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
});

const CarsList = ({
  handleSelectCar,
  selectedCarId,
  selectionTrigger,
  cars,
  isFetching,
}) => {
  return (
    <div className="flex flex-col gap-1 overflow-y-auto flex-1">
      {isFetching && <Loader />}

      {cars.map((car) => (
        <CarRow
          key={car.id}
          car={car}
          isSelected={car.id === selectedCarId}
          handleSelectCar={handleSelectCar}
          selectionTrigger={selectionTrigger}
        />
      ))}
    </div>
  );
};

export default CarsList;
