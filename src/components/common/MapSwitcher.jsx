import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { FiMap } from "react-icons/fi";
import { useDispatch, useSelector } from "react-redux";
import { switchMap } from "../../store/mapSlice";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";

/** من index.html — window.__MAPBOX_ENABLED__ */
const MAPBOX_ENABLED = window.__MAPBOX_ENABLED__ === true;

const MapSwitcher = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { provider: mapProvider } = useSelector((state) => state.map);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <div className="bg-white shadow rounded p-2 cursor-pointer hover:bg-gray-100">
          <FiMap className="text-xl text-gray-700" />
        </div>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="bg-white shadow-xl rounded-lg p-2 flex flex-col gap-2 z-50"
          side="left"
          align="start"
          sideOffset={5}
        >
          <DropdownMenu.Item
            className={`px-3 py-1 rounded cursor-pointer text-sm ${
              mapProvider === "google"
                ? "bg-mainColor text-white"
                : "hover:bg-mainColor/10 hover:text-mainColor"
            }`}
            onSelect={() => dispatch(switchMap("google"))}
          >
            {t("mapSwitcher.googleMaps")}
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className={`px-3 py-1 rounded cursor-pointer text-sm ${
              mapProvider === "mapbox"
                ? "bg-mainColor text-white"
                : "hover:bg-mainColor/10 hover:text-mainColor"
            } ${!MAPBOX_ENABLED ? "opacity-60" : ""}`}
            onSelect={(e) => {
              if (!MAPBOX_ENABLED) {
                e.preventDefault();
                toast.warning(t("mapSwitcher.mapboxNotAvailable"));
                return;
              }
              dispatch(switchMap("mapbox"));
            }}
          >
            {t("mapSwitcher.mapbox")}
          </DropdownMenu.Item>




          <DropdownMenu.Item
            className={`px-3 py-1 rounded cursor-pointer text-sm ${
              mapProvider === "openstreetmap"
                ? "bg-mainColor text-white"
                : "hover:bg-mainColor/10 hover:text-mainColor"
            }`}
            onSelect={() => dispatch(switchMap("openstreetmap"))}
          >
            {t("mapSwitcher.openStreetMap")}
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className={`px-3 py-1 rounded cursor-pointer text-sm ${
              mapProvider === "maplibre"
                ? "bg-mainColor text-white"
                : "hover:bg-mainColor/10 hover:text-mainColor"
            }`}
            onSelect={() => dispatch(switchMap("maplibre"))}
          >
            {t("mapSwitcher.mapLibre")}
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className={`px-3 py-1 rounded cursor-pointer text-sm ${
              mapProvider === "maptiler"
                ? "bg-mainColor text-white"
                : "hover:bg-mainColor/10 hover:text-mainColor"
            }`}
            onSelect={() => dispatch(switchMap("maptiler"))}
          >
            {t("mapSwitcher.mapTiler")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

export default MapSwitcher;
