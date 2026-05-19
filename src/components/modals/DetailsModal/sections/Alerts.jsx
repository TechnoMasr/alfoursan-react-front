import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "react-toastify";
import FormBtn from "../../../../components/form/FormBtn";
import { updateDialogAlert } from "../../../../services/monitorServices";
import { useTranslation } from "react-i18next";

const Alerts = ({ deviceSettings, refetch }) => {
  const { t } = useTranslation();

  const alerts = deviceSettings?.device;
  const deviceId = deviceSettings?.device?.id;

  if (!alerts || !deviceId)
    return (
      <p className="text-center py-2 px-4 my-20 w-fit mx-auto rounded-lg bg-primary text-white">
        {t("somethingWentWrong")}
      </p>
    );

  const [formData, setFormData] = useState({});

  useEffect(() => {
    setFormData({
      alert_speed_limit: alerts?.alert_speed_limit || 0,
      alert_speed_limit_value: alerts?.alert_speed_limit_value || "",
      alert_offline: alerts?.alert_offline || 0,
      alert_restricted_driving: alerts?.alert_restricted_driving || 0,
      alert_low_voltage: alerts?.alert_low_voltage || 0,
      alert_rest_threshold: alerts?.alert_rest_threshold || 0,
      alert_idle_speed: alerts?.alert_idle_speed || 0,
      alert_fatigue_driving: alerts?.alert_fatigue_driving || 0,
      alert_acc_off: alerts?.alert_acc_off || 0,
      alert_acc_on: alerts?.alert_acc_on || 0,
      alert_offline_judgment: alerts?.alert_offline_judgment || 0,

      // ✅ New Alerts
      alert_vibration: alerts?.alert_vibration || 0,
      alert_power_disconnect: alerts?.alert_power_disconnect || 0,
      alert_harsh_brake: alerts?.alert_harsh_brake || 0,
      alert_sharp_turn: alerts?.alert_sharp_turn || 0,
      alert_collision: alerts?.alert_collision || 0,
    });
  }, [alerts]);

  const alertsList = [
    { label: t("alerts.speedLimit"), key: "alert_speed_limit" },
    { label: t("alerts.offline"), key: "alert_offline" },
    // { label: t("alerts.restrictedDriving"), key: "alert_restricted_driving" },
    { label: t("alerts.lowVoltage"), key: "alert_low_voltage" },
    // { label: t("alerts.restThreshold"), key: "alert_rest_threshold" },
    { label: t("alerts.idleSpeed"), key: "alert_idle_speed" },
    { label: t("alerts.fatigueDriving"), key: "alert_fatigue_driving" },
    { label: t("alerts.accOff"), key: "alert_acc_off" },
    { label: t("alerts.accOn"), key: "alert_acc_on" },

    // ✅ New Alerts
    { label: t("alerts.vibrationAlarm"), key: "alert_vibration" },
    { label: t("alerts.powerAlarm"), key: "alert_power_disconnect" },
    { label: t("alerts.harshBrake"), key: "alert_harsh_brake" },
    { label: t("alerts.sharpTurn"), key: "alert_sharp_turn" },
    { label: t("alerts.collision"), key: "alert_collision" },
  ];

  const { mutate, isPending } = useMutation({
    mutationFn: () => updateDialogAlert(deviceId, formData),
    onSuccess: () => {
      toast.success(t("alerts.successMessage"));
      refetch?.();
    },
    onError: (error) => {
      toast.error(error?.response?.data?.message);
    },
  });

  const handleToggle = (key) => {
    setFormData((prev) => ({
      ...prev,
      [key]: prev[key] === 1 ? 0 : 1,
    }));
  };

  const handleInputChange = (key, value) => {
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSubmit = () => {
    mutate();
  };

  return (
    <section>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-4 mb-8">
        {alertsList.map((item, index) => {
          const showSpeedInput =
            item.key === "alert_speed_limit" &&
            formData.alert_speed_limit === 1;

          return (
            <div
              key={index}
              className={`flex flex-col gap-3 justify-center
            ${showSpeedInput ? "border border-gray-300 rounded-lg p-2" : ""}`}
            >
              <label className="flex items-center gap-2 w-fit">
                <input
                  type="checkbox"
                  className="toggle toggle-primary toggle-sm"
                  checked={formData[item.key] === 1}
                  onChange={() => handleToggle(item.key)}
                />
                <span className="text-gray-700 text-xs font-medium cursor-pointer">
                  {item.label}
                </span>
              </label>

              {showSpeedInput && (
                <input
                  type="number"
                  min="0"
                  placeholder={t("alerts.maxSpeedPlaceholder")}
                  className="w-full text-base bg-white outline-none border-none px-1 py-0.5 rounded-md ring-1 transition-all placeholder:text-gray-400 placeholder:text-sm 
                  ring-gray-400 focus-within:ring-2 focus-within:ring-mainColor"
                  value={formData.alert_speed_limit_value || ""}
                  onChange={(e) =>
                    handleInputChange("alert_speed_limit_value", e.target.value)
                  }
                />
              )}
            </div>
          );
        })}
      </div>

      <FormBtn
        title={t("alerts.updateBtn")}
        loading={isPending}
        onClick={handleSubmit}
      />
    </section>
  );
};

export default Alerts;
