// server values مثل "2026-04-14 14:28:22" بدون timezone:
// نعاملها كتوقيت السعودية صراحةً لتفادي اختلاف جهاز المستخدم.
const parseSaudiDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;

  const str = String(value).trim();
  // YYYY-MM-DD HH:mm:ss  -> YYYY-MM-DDTHH:mm:ss+03:00
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/.test(str)) {
    return new Date(str.replace(" ", "T") + "+03:00");
  }
  return new Date(str);
};

// 🧠 Helper: format difference between now and past time
const getTimeDiffString = (pastTime) => {
  const past = parseSaudiDate(pastTime);
  if (!past || Number.isNaN(past.getTime())) return "0m";

  let diffMs = Date.now() - past.getTime();
  if (diffMs < 0) diffMs = 0;

  const minutesTotal = Math.floor(diffMs / (1000 * 60));
  const days = Math.floor(minutesTotal / (60 * 24));
  const hours = Math.floor((minutesTotal % (60 * 24)) / 60);
  const minutes = minutesTotal % 60;

  // ⏱ لو أقل من 24 ساعة → ساعات ودقايق فقط
  if (days === 0) {
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  // 📅 لو أكتر من يوم → يوم + ساعة + دقيقة
  return `${days}d ${hours}h ${minutes}m`;
};

function getTimeDiffDetailed(lastSignelGPS) {
  const lastSignalDate = parseSaudiDate(lastSignelGPS);
  if (!lastSignalDate || Number.isNaN(lastSignalDate.getTime())) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, hoursSinceLastGPS: 0 };
  }

  let diffMs = Date.now() - lastSignalDate.getTime(); // الفرق بالميلي ثانية
  if (diffMs < 0) diffMs = 0; // حماية من القيم السالبة

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  diffMs -= days * 1000 * 60 * 60 * 24;

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  diffMs -= hours * 1000 * 60 * 60;

  const minutes = Math.floor(diffMs / (1000 * 60));
  diffMs -= minutes * 1000 * 60;

  const seconds = Math.floor(diffMs / 1000);

  const hoursSinceLastGPS = (Date.now() - lastSignalDate.getTime()) / (1000 * 60 * 60);

  return { days, hours, minutes, seconds, hoursSinceLastGPS };
}

// عتبة اعتبار المركبة متوقفة إذا لم تصل إشارة حركة (speed > 0) جديدة خلالها.
// تُعالج حالة: آخر إشارة كانت بسرعة 2-4 كم/س ثم انقطع الجهاز، فتظهر «متحركة» زوراً.
export const MOVING_STALE_MS = 3 * 60 * 1000; // 3 دقائق

// آخر لحظة تثبيت أثناء الحركة (بالميلي ثانية): من socket (lastGpsAtMs) وإلا من lastSignelGPS.
const getMovingFixMs = (car) => {
  if (typeof car?.lastGpsAtMs === "number" && Number.isFinite(car.lastGpsAtMs)) {
    return car.lastGpsAtMs;
  }
  const d = parseSaudiDate(car?.lastSignelGPS);
  return d && !Number.isNaN(d.getTime()) ? d.getTime() : null;
};

// هل المركبة تتحرك فعلياً الآن؟ سرعة > 1 وآخر تثبيت حركة ضمن العتبة الزمنية.
// يُعاد تقييمها مع كل إعادة رسم (حزمة socket / تفاعل) دون الحاجة لأي polling.
export const isVehicleMoving = (car) => {
  const s = Number(car?.speed) || 0;
  if (s <= 1) return false;
  const fixMs = getMovingFixMs(car);
  if (fixMs == null) return true; // لا يوجد زمن مرجعي → اعتمد على السرعة فقط
  return Date.now() - fixMs <= MOVING_STALE_MS;
};

// 🚗 Main function to get car status (Saudi time)
export const getCarStatus = (car) => {
  if (!car) return { status: "Unknown", color: "#6b7280" }; // رمادي فاتح

  const { lastSignel, lastSignelGPS, speed } = car;
  if (!lastSignel) return { status: "Inactive", color: "#6b7280" };
  const isInactive =
    car.isInactive === true ||
    (!lastSignel && !lastSignelGPS && !car.device_status && car.isOffline !== true);

  // ✅ Inactive: عمره ما اتصل / لا يوجد أي إشارات
  if (isInactive) return { status: "Inactive", color: "#6b7280" };
  /*
  const nowSaudi = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" })
  );
  const lastSignalTime = new Date(
    new Date(lastSignel).toLocaleString("en-US", { timeZone: "Asia/Riyadh" })
  );
  const lastGPS = new Date(
    new Date(lastSignelGPS).toLocaleString("en-US", { timeZone: "Asia/Riyadh" })
  );
  */

  // const hoursSinceLastSignal = (nowSaudi - lastSignalTime) / (1000 * 60 * 60);
  // const hoursSinceLastGPS = (nowSaudi - lastGPS) / (1000 * 60 * 60);

  // ⏹ Offline (مصدره API.isOffline أو السوكت device.status='offline')
  if (car.isOffline) {
    const sinceSource = lastSignel || lastSignelGPS  || car.device_lastUpdate;
    return {
      status: sinceSource ? `Offline (${getTimeDiffString(sinceSource)})` : "Offline",
      color: "#ef4444",
    };
  }



  // 🟢 Moving — فقط إذا كانت آخر إشارة حركة حديثة (تفادي «متحرك» وهمي بعد انقطاع الإشارة)
  const s = Number(speed) || 0;
  if (s > 1 && isVehicleMoving(car)) {
    return {
      status: `Moving (${s} km/h)`,
      color: "#22c55e",
    };
  }
  if (s > 0 && s <= 1) {
    return { status: "Static", color: "#3b82f6" };
  }

  // 🔵 متوقفة: إمّا السرعة <= 1، أو سرعة قديمة تجاوزت العتبة الزمنية (MOVING_STALE_MS).
  // مدة «منذ» من last_gps_at (lastSignelGPS) التي يحدّثها الخادم عند speed > 0.
  const sinceSource = lastSignelGPS;
  return {
    status: sinceSource ? `Static (${getTimeDiffString(sinceSource)})` : "Static",
    color: "#3b82f6",
  };
};
