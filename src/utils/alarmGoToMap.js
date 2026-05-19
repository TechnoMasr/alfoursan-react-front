/** طلب الانتقال لمركبة على الخريطة (TenantDashboard يستمع لهذا الحدث) */
export function requestAlarmGoToMap({ imei, carId } = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("alarm-go-to-map", {
      detail: { imei, carId },
    }),
  );
}
