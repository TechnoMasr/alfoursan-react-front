import { useState } from "react";
import MainInput from "../../../components/form/MainInput";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getDevicesForCarReplay } from "../../../services/monitorServices";
import { IoChevronDown } from "react-icons/io5";
import { IoMdSearch } from "react-icons/io";
import { useTranslation } from "react-i18next";

const pad2 = (n) => String(n).padStart(2, "0");

// ✅ datetime-local بصيغة محلية (timezone الجهاز) وليس UTC
const toLocalInputDateTime = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(
    d.getHours(),
  )}:${pad2(d.getMinutes())}`;
};

const toLocalDate = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

// ✅ التحويل لصيغة API المطلوبة: YYYY-MM-DD HH:mm:ss
const toApiDateTime = (localInputValue) => {
  if (!localInputValue) return "";
  const [datePart = "", timePartRaw = ""] = String(localInputValue).split("T");
  const [hh = "00", mm = "00", ss = "00"] = timePartRaw.split(":");
  return `${datePart} ${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
};

const ReplayFilter = ({ onDateChange, serial_number }) => {
  const { t } = useTranslation();
  const today = toLocalInputDateTime(new Date());
  const endOfToday = `${toLocalDate(new Date())}T23:59`;
  const clientTimezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Riyadh";
  const [activePreset, setActivePreset] = useState("");

  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const handleSubmit = (e) => {
    e.preventDefault();

    const diffDays =
      (new Date(to).getTime() - new Date(from).getTime()) /
      (1000 * 60 * 60 * 24);

    if (diffDays < 0) {
      toast.warning(t("replayFilter.endDateAfterStart"));
      return;
    }

    if (diffDays > 30) {
      toast.warning(t("replayFilter.max30Days"));
      return;
    }

    setActivePreset("");
    onDateChange(toApiDateTime(from), toApiDateTime(to), clientTimezone);
  };

  // دوال اختصارات التواريخ
  const setYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const y = toLocalDate(d);
    const from = `${y}T00:00`;
    const to = `${y}T23:59`;
    setActivePreset("yesterday");
    setFrom(from);
    setTo(to);
    onDateChange(toApiDateTime(from), toApiDateTime(to), clientTimezone);
  };

  const setToday = () => {
    const t = toLocalDate(new Date());
    const from = `${t}T00:00`;
    const to = today; // اللي عرّفته فوق بالـ slice(0, 16)
    setActivePreset("today");
    setFrom(from);
    setTo(to);
    onDateChange(toApiDateTime(from), toApiDateTime(to), clientTimezone);
  };

  const setThisWeek = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const start = new Date(now);
    start.setDate(now.getDate() - dayOfWeek);

    const weekStart = `${toLocalDate(start)}T00:00`;
    const weekEnd = today;

    setActivePreset("thisWeek");
    setFrom(weekStart);
    setTo(weekEnd);
    onDateChange(
      toApiDateTime(weekStart),
      toApiDateTime(weekEnd),
      clientTimezone,
    );
  };

  const setLastWeek = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();

    const end = new Date(now);
    end.setDate(now.getDate() - dayOfWeek - 1);

    const start = new Date(end);
    start.setDate(end.getDate() - 6);

    const lastWeekStart = `${toLocalDate(start)}T00:00`;
    const lastWeekEnd = `${toLocalDate(end)}T23:59`;

    setActivePreset("lastWeek");
    setFrom(lastWeekStart);
    setTo(lastWeekEnd);
    onDateChange(
      toApiDateTime(lastWeekStart),
      toApiDateTime(lastWeekEnd),
      clientTimezone,
    );
  };

  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const { data: devices, isLoading } = useQuery({
    queryKey: ["devices-for-car-replay"],
    queryFn: getDevicesForCarReplay,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // const filteredDevices =
  //   devices?.filter((device) =>
  //     device.name.toLowerCase().includes(search.toLowerCase()),
  //   ) ?? [];
  const filteredDevices =
    devices?.filter((device) =>
      (device?.name ?? "").toLowerCase().includes(search.toLowerCase()),
    ) ?? [];

  const navigate = useNavigate();

  return (
    <header className="absolute w-screen top-0 left-0 bg-white shadow-lg rounded-b-4xl p-3 space-y-2">
      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap items-center justify-center gap-4"
      >
        <div className="flex items-center gap-1 relative">
          <label className="text-sm">{t("replayFilter.device")}:</label>

          <div className={`dropdown ${isOpen ? "dropdown-open" : ""}`}>
            <div
              tabIndex={0}
              role="button"
              className="btn btn-sm bg-white border border-gray-300 min-w-[180px] justify-between flex items-center"
              onClick={() => setIsOpen((prev) => !prev)}
            >
              <span>
                {devices?.find((d) => d.serial_number === serial_number)
                  ?.name || t("replayFilter.selectDevice")}
              </span>

              <IoChevronDown
                className={`transition-transform duration-200 ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </div>

            <div
              tabIndex={0}
              className="dropdown-content z-50 menu p-2 shadow bg-base-100 rounded-box w-64"
            >
              {/* Search Input */}
              <div className="p-2">
                <input
                  type="text"
                  placeholder={t("replayFilter.searchDevice")}
                  className="input input-sm input-primary input-bordered w-full"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* Devices List */}
              <ul className="max-h-60 overflow-y-auto">
                {isLoading && (
                  <li className="px-3 py-2 text-sm text-gray-400">
                    {t("replayFilter.loading")}
                  </li>
                )}

                {!isLoading && filteredDevices.length === 0 && (
                  <li className="px-3 py-2 text-sm text-gray-400">
                    {t("replayFilter.noResults")}
                  </li>
                )}

                {filteredDevices.map((device) => (
                  <li key={device?.serial_number}>
                    <button
                      className="text-left w-full"
                      onClick={() => {
                        navigate(`/car-replay/${device?.serial_number}`);
                        setIsOpen(false);
                        setSearch("");
                      }}
                    >
                      {device?.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <label className="text-sm" htmlFor="from">
            {t("replayFilter.from")}
          </label>

          <MainInput
            id="from"
            type="datetime-local"
            value={from}
            max={today}
            onChange={(e) => {
              setActivePreset("");
              setFrom(e.target.value);
            }}
          />
        </div>

        <div className="flex items-center gap-1">
          <label className="text-sm" htmlFor="to">
            {t("replayFilter.to")}
          </label>

          <MainInput
            id="to"
            type="datetime-local"
            value={to}
            max={endOfToday}
            onChange={(e) => {
              setActivePreset("");
              setTo(e.target.value);
            }}
          />
        </div>

        <button
          type="submit"
          className="btn btn-circle btn-md btn-primary bg-mainColor border-mainColor"
          title={t("replayFilter.search")}
        >
          <IoMdSearch className="text-2xl" />
        </button>
      </form>

      {/* الاختصارات */}
      <div className="flex flex-wrap items-center justify-center gap-4">
        <button
          type="button"
          onClick={setYesterday}
          className={`px-3 py-1.5 rounded-full text-sm transition-all cursor-pointer border ${
            activePreset === "yesterday"
              ? "bg-mainColor text-white border-mainColor shadow-sm"
              : "bg-white text-mainColor border-mainColor/30 hover:bg-mainColor/10"
          }`}
        >
          {t("replayFilter.yesterday")}
        </button>

        <button
          type="button"
          onClick={setToday}
          className={`px-3 py-1.5 rounded-full text-sm transition-all cursor-pointer border ${
            activePreset === "today"
              ? "bg-mainColor text-white border-mainColor shadow-sm"
              : "bg-white text-mainColor border-mainColor/30 hover:bg-mainColor/10"
          }`}
        >
          {t("replayFilter.today")}
        </button>

        <button
          type="button"
          onClick={setThisWeek}
          className={`px-3 py-1.5 rounded-full text-sm transition-all cursor-pointer border ${
            activePreset === "thisWeek"
              ? "bg-mainColor text-white border-mainColor shadow-sm"
              : "bg-white text-mainColor border-mainColor/30 hover:bg-mainColor/10"
          }`}
        >
          {t("replayFilter.thisWeek")}
        </button>

        <button
          type="button"
          onClick={setLastWeek}
          className={`px-3 py-1.5 rounded-full text-sm transition-all cursor-pointer border ${
            activePreset === "lastWeek"
              ? "bg-mainColor text-white border-mainColor shadow-sm"
              : "bg-white text-mainColor border-mainColor/30 hover:bg-mainColor/10"
          }`}
        >
          {t("replayFilter.lastWeek")}
        </button>

        <p className="text-stone-600 text-center text-xs">
          {t("replayFilter.maxTimeRange")}
        </p>
      </div>
    </header>
  );
};

export default ReplayFilter;
