import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { IoNotificationsOutline } from "react-icons/io5";
import {
  subscribeAlarmPool,
  getAlarmEntries,
  clearAlarmPool,
} from "../../utils/alarmPool";
import { copyToClipboard } from "../../utils/copyToClipboard";
import { requestAlarmGoToMap } from "../../utils/alarmGoToMap";
import AlarmGoToMapButton from "./AlarmGoToMapButton";

const isPoolEnabled = () =>
  typeof window === "undefined" || window.__ALARM_POOL_ENABLED__ !== false;

const AlarmPoolBtn = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [, bump] = useState(0);

  const refresh = useCallback(() => bump((n) => n + 1), []);

  useEffect(() => {
    if (!isPoolEnabled()) return undefined;
    return subscribeAlarmPool(refresh);
  }, [refresh]);

  if (!isPoolEnabled()) return null;

  const list = getAlarmEntries();
  const count = list.length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="bg-white shadow rounded p-2 cursor-pointer hover:bg-gray-100 relative"
        aria-label={t("mapActions.alarmPoolTitle")}
        title={t("mapActions.alarmPoolTitle")}
      >
        <IoNotificationsOutline className="text-xl text-mainColor" />
        {count > 0 && (
          <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-39 bg-black/20"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div
            className="fixed top-16 start-3 w-[min(100vw-1.5rem,380px)] max-h-[min(70vh,420px)] z-40 bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
            dir="rtl"
          >
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100 bg-mainColor/5">
              <h3 className="text-sm font-bold text-gray-800">
                {t("mapActions.alarmPoolTitle")}
              </h3>
              {count > 0 && (
                <button
                  type="button"
                  onClick={() => clearAlarmPool()}
                  className="text-xs text-red-600 hover:underline"
                >
                  {t("mapActions.alarmPoolClear")}
                </button>
              )}
            </div>
            <div className="overflow-y-auto flex-1 p-2 space-y-2">
              {count === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  {t("mapActions.alarmPoolEmpty")}
                </p>
              ) : (
                list.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-lg border border-gray-100 bg-gray-50/80 p-2 text-xs space-y-1"
                  >
                    <p className="font-semibold text-red-700 leading-snug">
                      {row.alarmText}
                    </p>
                    <div className="flex flex-wrap gap-x-2 gap-y-1 text-gray-700">
                      <button
                        type="button"
                        className="font-medium text-mainColor hover:underline text-start"
                        onClick={() => copyToClipboard(row.carName)}
                      >
                        {row.carName}
                      </button>
                      <span className="text-gray-400">|</span>
                      <button
                        type="button"
                        className="text-gray-600 hover:underline break-all text-start"
                        onClick={() => copyToClipboard(row.imei)}
                      >
                        IMEI: {row.imei}
                      </button>
                    </div>
                    <div className="flex justify-between text-[11px] text-gray-500">
                      <span>
                        {row.speed != null
                          ? `${row.speed} ${t("mapActions.alarmPoolKmh")}`
                          : "—"}
                      </span>
                      <span>
                        {row.date || new Date(row.at).toLocaleString()}
                      </span>
                    </div>
                    <AlarmGoToMapButton
                      className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-mainColor text-white text-[11px] font-bold py-1.5 px-2 hover:brightness-110 transition-all"
                      onClick={() => {
                        requestAlarmGoToMap({
                          imei: row.imei,
                          carId: row.carId,
                        });
                        setOpen(false);
                      }}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AlarmPoolBtn;
