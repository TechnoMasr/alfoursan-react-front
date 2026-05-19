import { useDispatch, useSelector } from "react-redux";
import { switchMap } from "../../../store/mapSlice";
import { showGoogleDrawingHint } from "../../../utils/showGoogleDrawingHint";
import { setPendingGoogleDraw } from "../../../utils/pendingGoogleDraw";
import MapSwitcher from "../../../components/common/MapSwitcher";
import ZoomBtns from "../../../components/common/ZoomBtns";
import MapTypes from "../../../components/common/MapTypes";
import PolygonMenu from "../../../components/modals/PolygonMenu";
import SupportBtn from "../../../components/common/SupportBtn";
import NotificationBtn from "../../../components/common/NotificationBtn";
import AlarmPoolBtn from "../../../components/common/AlarmPoolBtn";
import AlarmPopupBtn from "../../../components/common/AlarmPopupBtn";
import { CgHomeAlt } from "react-icons/cg";
import { useTranslation } from "react-i18next";

const MapActions = ({ setViewState }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { provider: mapProvider } = useSelector((state) => state.map);

  const BACK_URL = window.__BACK_URL__;

  return (
    <div className="absolute top-3 right-3 z-20 space-y-2 flex flex-col items-center">
      <a
        href={BACK_URL}
        className="bg-white 
        shadow rounded p-2 cursor-pointer hover:bg-gray-100"
      >
        <CgHomeAlt className="text-xl text-gray-700" />
      </a>
      <MapSwitcher />
      <MapTypes />
     
      <PolygonMenu
        onDrawSelect={(type) => {
          if (mapProvider !== "google") {
            showGoogleDrawingHint(t, () => {
              setPendingGoogleDraw(type);
              dispatch(switchMap("google"));
            });
            return false;
          }
          window.dispatchEvent(
            new CustomEvent("start-drawing", { detail: { type } }),
          );
          return true;
        }}
      />


      <ZoomBtns mapProvider={mapProvider} setViewState={setViewState} />
      <SupportBtn />
      <NotificationBtn />
      <AlarmPoolBtn />
      <AlarmPopupBtn />
    </div>
  );
};

export default MapActions;
