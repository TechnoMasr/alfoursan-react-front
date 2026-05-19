import { toast } from "react-toastify";
import { PiPolygonFill } from "react-icons/pi";

/**
 * تنبيه عند محاولة رسم سياج على خريطة غير Google.
 * @param {Function} t - i18next t
 * @param {Function} onSwitchToGoogle - مثلاً dispatch(switchMap("google"))
 */
export function showGoogleDrawingHint(t, onSwitchToGoogle) {
  toast.info(
    ({ closeToast }) => (
      <div
        className="flex gap-3 items-start min-w-[260px] max-w-[320px] py-0.5"
        dir="auto"
      >
        <div className="shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
          <PiPolygonFill className="text-amber-600 text-xl" aria-hidden />
        </div>
        <div className="flex-1 space-y-2 text-start">
          <p className="font-bold text-gray-900 text-sm leading-snug">
            {t("mapActions.drawingGoogleTitle")}
          </p>
          <p className="text-gray-600 text-xs leading-relaxed">
            {t("mapActions.drawingGoogleBody")}
          </p>
          <button
            type="button"
            className="w-full rounded-lg bg-mainColor text-white text-xs font-semibold py-2 px-3 hover:brightness-110 transition"
            onClick={() => {
              onSwitchToGoogle?.();
              closeToast();
            }}
          >
            {t("mapActions.switchToGoogle")}
          </button>
        </div>
      </div>
    ),
    {
      autoClose: 10000,
      icon: false,
      className: "!rounded-xl !shadow-lg",
    },
  );
}
