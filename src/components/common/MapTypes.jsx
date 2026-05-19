import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MdLayers } from "react-icons/md";
import { useDispatch, useSelector } from "react-redux";
import { setMapType } from "../../store/mapSlice";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { MAPTILER_MAP_TYPES } from "../../pages/TenantDashboard/Maps/mapTilerStyles";

const MapTypes = ({ onChange }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { mapType, provider } = useSelector((state) => state.map);

  const mapTypes = useMemo(() => {
    if (provider === "maptiler") {
      return MAPTILER_MAP_TYPES.map((item) => ({
        label: t(item.labelKey),
        value: item.id,
      }));
    }

    return [
      { label: t("mapTypes.roadmap"), value: "roadmap" },
      { label: t("mapTypes.satellite"), value: "satellite" },
      { label: t("mapTypes.terrain"), value: "terrain" },
      { label: t("mapTypes.hybrid"), value: "hybrid" },
    ];
  }, [provider, t]);

  const handleMapTypeChange = (type) => {
    if (onChange) {
      onChange(type);
    } else {
      dispatch(setMapType(type));
    }
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <div className="bg-white shadow rounded p-2 cursor-pointer hover:bg-gray-100">
          <MdLayers className="text-xl text-gray-700" />
        </div>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="bg-white shadow-xl rounded-lg p-2 flex flex-col gap-2 z-50 max-h-[70vh] overflow-y-auto"
          side="left"
          align="start"
          sideOffset={5}
        >
          {mapTypes.map((type) => (
            <DropdownMenu.Item
              key={type.value}
              className={`px-3 py-1 rounded cursor-pointer text-sm ${
                mapType === type.value
                  ? "bg-mainColor text-white"
                  : "hover:bg-mainColor/10 hover:text-mainColor"
              }`}
              onSelect={() => handleMapTypeChange(type.value)}
            >
              {type.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

export default MapTypes;
