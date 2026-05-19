import { useDispatch, useSelector } from "react-redux";
import { toggleAlarmPopup } from "../../store/mapSlice";
import { IoNotifications, IoNotificationsOff } from "react-icons/io5";
import { useTranslation } from "react-i18next";

const AlarmPopupBtn = () => {
  const { t } = useTranslation();
  const { alarmPopupEnabled } = useSelector((state) => state.map);
  const dispatch = useDispatch();

  return (
    <button
      type="button"
      onClick={() => dispatch(toggleAlarmPopup())}
      className="bg-white shadow rounded p-2 cursor-pointer hover:bg-gray-100"
      title={
        alarmPopupEnabled
          ? t("mapActions.alarmPopupOn")
          : t("mapActions.alarmPopupOff")
      }
      aria-label={
        alarmPopupEnabled
          ? t("mapActions.alarmPopupOn")
          : t("mapActions.alarmPopupOff")
      }
    >
      {alarmPopupEnabled ? (
        <IoNotifications className="text-xl text-mainColor" />
      ) : (
        <IoNotificationsOff className="text-xl text-gray-400" />
      )}
    </button>
  );
};

export default AlarmPopupBtn;
