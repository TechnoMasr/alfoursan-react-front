/**
 * حوض تخزين تنبيهات الإنذار (للعرض في الـ UI).
 * الافتراضي: في الذاكرة فقط — يُفرغ عند إعادة تحميل الصفحة بالكامل.
 * اختياري: عند window.__ALARM_POOL_USE_LOCAL_STORAGE__ === true يُزامن مع localStorage
 * (يقلل الاحتفاظ بمصفوفة كبيرة في React؛ يمكن أن يبقى بعد التحديث حسب الإعدادات).
 */

const STORAGE_KEY = "alfoursan_alarm_pool_v1";
const MAX_ENTRIES = 300;

let entries = [];
const listeners = new Set();

function loadFromStorage() {
  if (typeof window === "undefined" || !window.__ALARM_POOL_USE_LOCAL_STORAGE__) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) entries = parsed.slice(0, MAX_ENTRIES);
  } catch {
    // ignore
  }
}

function saveToStorage() {
  if (typeof window === "undefined" || !window.__ALARM_POOL_USE_LOCAL_STORAGE__) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // ignore quota / private mode
  }
}

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore
    }
  });
}

if (typeof window !== "undefined") {
  loadFromStorage();
}

/**
 * @param {{ imei: string, carId?: string|number, carName: string, alarmText: string, speed?: number, date?: string }} payload
 */
export function pushAlarmEntry(payload) {
  if (typeof window !== "undefined" && window.__ALARM_POOL_ENABLED__ === false) {
    return;
  }
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const item = {
    id,
    at: Date.now(),
    imei: String(payload.imei ?? ""),
    carId: payload.carId != null ? payload.carId : null,
    carName: String(payload.carName ?? ""),
    alarmText: String(payload.alarmText ?? ""),
    speed: payload.speed,
    date: payload.date != null ? String(payload.date) : "",
  };
  entries = [item, ...entries].slice(0, MAX_ENTRIES);
  saveToStorage();
  notify();
}

export function getAlarmEntries() {
  return entries;
}

export function subscribeAlarmPool(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearAlarmPool() {
  entries = [];
  if (typeof window !== "undefined" && window.__ALARM_POOL_USE_LOCAL_STORAGE__) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  notify();
}
