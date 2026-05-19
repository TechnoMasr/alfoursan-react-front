import { useTranslation } from "react-i18next";

const AlarmGoToMapButton = ({ onClick, className = "" }) => {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        className ||
        "w-full flex items-center justify-center gap-2 rounded-xl bg-mainColor text-white text-xs font-bold py-2 px-3 shadow shadow-mainColor/20 hover:brightness-110 active:scale-[0.99] transition-all"
      }
    >
      <svg
        className="w-4 h-4 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
      {t("alarmToast.goToMap", "اذهب للخريطة")}
    </button>
  );
};

export default AlarmGoToMapButton;
