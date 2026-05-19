import { useDispatch, useSelector } from "react-redux";
import {
  mapProviderSupportsClusters,
  toggleClusters,
  toggleDeviceName,
} from "../../../../store/mapSlice";
import { MdOutlineTitle } from "react-icons/md";
import { PiCirclesThreeFill } from "react-icons/pi";
import { useTranslation } from "react-i18next";

const Actions = () => {
  const { t } = useTranslation();
  const { clusters, showDeviceName, provider } = useSelector(
    (state) => state.map,
  );
  const dispatch = useDispatch();
  const showClusterToggle = mapProviderSupportsClusters(provider);

  return (
    <div className="flex justify-end gap-2">
      <span
        title={t("actions.deviceName")}
        onClick={() => dispatch(toggleDeviceName())}
        className={`cursor-pointer text-xl transition w-7 h-7 rounded-full flex items-center justify-center shadow-md ${
          showDeviceName
            ? "bg-mainColor text-white"
            : "bg-mainColor/10 text-gray-600"
        } `}
      >
        <MdOutlineTitle />
      </span>

      {showClusterToggle && (
        <span
          title={t("actions.cluster")}
          onClick={() => dispatch(toggleClusters())}
          className={`cursor-pointer text-xl transition w-7 h-7 rounded-full flex items-center justify-center shadow-md ${
            clusters
              ? "bg-mainColor text-white"
              : "bg-mainColor/10 text-gray-600"
          } `}
        >
          <PiCirclesThreeFill />
        </span>
      )}
    </div>
  );
};

export default Actions;
