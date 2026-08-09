import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { isVehicleMoving } from "../../../../utils/getCarStatus";

const Filters = ({ cars, activeFilter, setActiveFilter }) => {
  const { t } = useTranslation();
  const filterTypes = useMemo(() => {
    const total = cars?.length || 0;
    let online = 0;
    let offline = 0;
    let moving = 0;
    let inactive = 0;

    (cars || []).forEach((c) => {
      if (c.isInactive) {
        inactive += 1;
        return;
      }
      if (c.isOffline) {
        offline += 1;
        return;
      }

      online += 1;
      if (isVehicleMoving(c)) moving += 1;
    });

    return [
      { label: "all", value: total },
    //  { label: "inactive", value: inactive },
      { label: "online", value: online },
      { label: "offline", value: offline },
      { label: "moving", value: moving },
    ];
  }, [cars]);

  return (
    <div className="bg-mainColor/10 p-2 rounded-xl flex gap-2">
      {filterTypes.map((type, index) => (
        <button
          key={index}
          onClick={() => setActiveFilter(type.label)}
          className={`p-1 flex-1 text-xs rounded-lg capitalize cursor-pointer ${
            activeFilter === type.label
              ? "bg-mainColor text-white"
              : "text-gray-600 hover:bg-mainColor/10 hover:text-mainColor"
          }`}
        >
          {t(`filters.${type.label}`)} ({type.value})
        </button>
      ))}
    </div>
  );
};

export default Filters;
