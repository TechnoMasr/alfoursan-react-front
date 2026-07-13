// useCarSocket.jsx — migrated to Sonner
// npm install sonner

import { useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { setCommandResponse } from "../store/modalsSlice";
import { pushAlarmEntry } from "../utils/alarmPool";
import { copyToClipboard } from "../utils/copyToClipboard";
import { requestAlarmGoToMap } from "../utils/alarmGoToMap";
import AlarmGoToMapButton from "../components/common/AlarmGoToMapButton";
import {
  mergeTelemetry,
  pickSocketAttributes,
  telemetryFromAttributes,
  withStickyTelemetry,
} from "../utils/deviceTelemetry";
import { getFleetLive, patchFleetLive } from "../utils/fleetPositionStore";

/** Global WS channel for command replies (matches gps-server spelling). */
const COMMAND_RESPONSE_CHANNEL = "command_response_chanel";

const cmdChannelDebug = () =>
  typeof window !== "undefined" && window.__DEBUG_CMD_CHANNEL__ === true;

const cmdChannelBp = (label, extra) => {
  if (!cmdChannelDebug()) return;
  console.log(`[BP:cmd-channel] ${label}`, extra);
  // Set window.__DEBUG_CMD_CHANNEL_BREAK__ = true to pause in DevTools
  if (window.__DEBUG_CMD_CHANNEL_BREAK__ === true) debugger;
};

/* ─────────────────────────────────────────────
   Alarm Toast UI  (Sonner rich-content version)
   يُمرَّر كـ JSX مباشرة لـ toast.custom()
───────────────────────────────────────────── */
const AlarmToast = ({
  toastId,
  carName,
  speed,
  alarm,
  IMEI,
  showGoToMap,
  onGoToMap,
}) => {
  const { t } = useTranslation();

  return (
    <div
      className="w-full max-w-[320px]"
      dir="rtl"
      style={{ fontFamily: "inherit" }}
    >
      <div className="rounded-2xl border border-red-200/90 bg-white shadow-xl shadow-red-900/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-3 pt-3 pb-2 bg-linear-to-l from-red-50/80 to-white">
          <div className="h-9 w-9 shrink-0 rounded-xl bg-red-100 text-red-600 flex items-center justify-center ring-2 ring-red-200/60">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path
                fillRule="evenodd"
                d="M9.401 3.003c1.155-2 4.043-2 5.198 0l7.17 12.414c1.154 2-.288 4.5-2.599 4.5H4.83c-2.31 0-3.753-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 9a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <p className="flex-1 min-w-0 text-sm font-extrabold text-red-900 leading-snug border-s-[3px] border-red-400 ps-2 truncate">
            {alarm}
          </p>
          {/* زر الإغلاق */}
          <button
            type="button"
            onClick={() => toast.dismiss(toastId)}
            className="shrink-0 h-7 w-7 flex items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
            aria-label={t("alarmToast.close", "إغلاق")}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-3.5 w-3.5"
            >
              <path
                fillRule="evenodd"
                d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-3 pb-3 space-y-2">
          <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-xs space-y-1.5">
            {/* Car */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-400 shrink-0">
                {t("alarmToast.car", "السيارة")}
              </span>
              <div className="flex items-center gap-1 min-w-0">
                <span className="font-bold text-slate-800 truncate">
                  {carName}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(carName)}
                  className="shrink-0 p-0.5 rounded text-slate-400 hover:text-mainColor"
                  title={t("alarmToast.copyName", "نسخ")}
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Speed */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-400">
                {t("alarmToast.speed", "السرعة")}
              </span>
              <span className="font-semibold tabular-nums text-slate-800">
                {speed} {t("alarmToast.kmh", "كم/س")}
              </span>
            </div>

            {/* IMEI */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/80">
              <span className="text-slate-400 shrink-0">IMEI</span>
              <div className="flex items-center gap-1 min-w-0 justify-end">
                <span className="font-mono text-[11px] text-slate-600 truncate">
                  {IMEI}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(IMEI)}
                  className="shrink-0 p-0.5 rounded text-slate-400 hover:text-mainColor"
                  title={t("alarmToast.copyImei", "نسخ")}
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Go to map button */}
          {showGoToMap && <AlarmGoToMapButton onClick={onGoToMap} />}
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Hook
───────────────────────────────────────────── */
const useCarSocket = (cars, setCars, isInit, options = {}) => {
  const dispatch = useDispatch();
  const { notificationSound, alarmPopupEnabled } = useSelector(
    (state) => state.map,
  );
  const { detailsModal } = useSelector((state) => state.modals);

  const enabled = options?.enabled ?? true;
  const resetKey = options?.resetKey ?? 0;
  const onStatusChange = options?.onStatusChange;
  const onAlarmSelectCar = options?.onAlarmSelectCar;
  const debug = options?.debug ?? false;
  const tag = options?.tag ?? "CarSocket";
  const tenantRoomFromWindow =
    typeof window !== "undefined" ? window.__TENANT_ROOM__ : null;
  const resolvedTenantRoom = options?.tenantRoom ?? tenantRoomFromWindow ?? null;
  const tenantRoomFlagFromWindow =
    typeof window !== "undefined" ? window.__USE_TENANT_ROOM__ : undefined;
  const useTenantRoomEnabled =
    options?.useTenantRoom ??
    (typeof tenantRoomFlagFromWindow === "boolean" ? tenantRoomFlagFromWindow : true);
  const useTenantRoom = Boolean(useTenantRoomEnabled && resolvedTenantRoom);
  /** When false, GPS updates go to fleetPositionStore only (large fleet dashboards). */
  const updateCarsOnGps = options?.updateCarsOnGps ?? true;
  const useFleetStore = options?.useFleetStore ?? false;
  const tenantRoomRef = useRef(resolvedTenantRoom);

  const alarmAudioRef = useRef(null);
  const notificationSoundRef = useRef(notificationSound);
  const alarmPopupEnabledRef = useRef(alarmPopupEnabled);
  const detailsModalRef = useRef(detailsModal);
  const onAlarmSelectCarRef = useRef(onAlarmSelectCar);
  const wsRef = useRef(null);
  const subscribedImeisRef = useRef(new Set());
  const indexByImeiRef = useRef(new Map());
  const onStatusRef = useRef(onStatusChange);
  const carsRef = useRef(cars);
  /** Dedupe command_response when both channel + IMEI paths deliver the same reply */
  const lastCmdKeyRef = useRef("");
  const cmdChannelSubscribedRef = useRef(false);

  useEffect(() => {
    notificationSoundRef.current = notificationSound;
  }, [notificationSound]);
  useEffect(() => {
    alarmPopupEnabledRef.current = alarmPopupEnabled;
  }, [alarmPopupEnabled]);
  useEffect(() => {
    detailsModalRef.current = detailsModal;
  }, [detailsModal]);
  useEffect(() => {
    onStatusRef.current = onStatusChange;
  }, [onStatusChange]);
  useEffect(() => {
    onAlarmSelectCarRef.current = onAlarmSelectCar;
  }, [onAlarmSelectCar]);
  useEffect(() => {
    carsRef.current = cars;
  }, [cars]);

  const emitStatus = (status, extra = {}) => {
    try {
      onStatusRef.current?.({ status, ...extra });
    } catch {
      /* ignore */
    }
  };

  const log = (...args) => {
    if (debug) console.log(`[${tag}]`, ...args);
  };
  const warn = (...args) => {
    if (debug) console.warn(`[${tag}]`, ...args);
  };
  const error = (...args) => {
    console.error(`[${tag}]`, ...args);
  };

  const parseTimeMs = (value) => {
    if (!value) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  };

  const resolvePacketMs = (data, gps, dateValue) =>
    parseTimeMs(data?.data?.packet_date) ??
    parseTimeMs(dateValue) ??
    parseTimeMs(gps?.date) ??
    parseTimeMs(data?.data?.traccar_raw?.fixTime) ??
    parseTimeMs(data?.data?.traccar_raw?.deviceTime) ??
    null;

  const normalizeBool = (value) => {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const v = value.toLowerCase();
      if (v === "on" || v === "true" || v === "1") return true;
      if (v === "off" || v === "false" || v === "0") return false;
      return null;
    }
    if (typeof value === "number")
      return Number.isFinite(value) ? value !== 0 : null;
    return !!value;
  };

  useEffect(() => {
    alarmAudioRef.current = new Audio("/alarm.wav");
    alarmAudioRef.current.volume = 1;
    alarmAudioRef.current.preload = "auto";
  }, []);

  useEffect(() => {
    if (!enabled) {
      emitStatus("disabled");
      const ws = wsRef.current;
      if (ws) {
        try {
          ws.close();
        } finally {
          wsRef.current = null;
          subscribedImeisRef.current = new Set();
          indexByImeiRef.current = new Map();
        }
      }
      return;
    }

    if (!isInit) return;
    if (!useTenantRoom && (!cars || cars.length === 0)) return;

    emitStatus("connecting");
    log("connecting...", { resetKey, useTenantRoom });

    const wsUrl =
      (typeof window !== "undefined" && window.__WS_URL__) ||
      "wss://alfursantracking.com/ws-backup/";
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    subscribedImeisRef.current = new Set();
    indexByImeiRef.current = new Map();

    if (useTenantRoom) {
      (carsRef.current || []).forEach((car, idx) => {
        const imei = car?.serial_number;
        if (imei) indexByImeiRef.current.set(imei, idx);
      });
    }

    ws.onopen = () => {
      emitStatus("open");
      cmdChannelSubscribedRef.current = false;

      // Always join the fast command-response channel (independent of tenant room / IMEI)
      ws.send(
        JSON.stringify({
          type: "subscribe_command_response_channel",
          channel: COMMAND_RESPONSE_CHANNEL,
        }),
      );
      cmdChannelSubscribedRef.current = true;
      cmdChannelBp("subscribe sent", { channel: COMMAND_RESPONSE_CHANNEL });
      log("subscribe_command_response_channel =>", COMMAND_RESPONSE_CHANNEL);

      if (useTenantRoom) {
        const room = tenantRoomRef.current;
        if (!room) {
          warn("tenant room missing (__TENANT_ROOM__)");
          emitStatus("error", { reason: "missing_tenant_room" });
          return;
        }
        ws.send(JSON.stringify({ type: "subscribe_tenant_room", room }));
        log("subscribe_tenant_room =>", room);
        emitStatus("ready", {
          tenantRoom: room,
          commandChannel: COMMAND_RESPONSE_CHANNEL,
          subscribedCount: 0,
        });
        return;
      }

      let subscribedCount = 0;
      (carsRef.current || []).forEach((car, idx) => {
        const imei = car?.serial_number;
        if (!imei) return;
        if (!indexByImeiRef.current.has(imei))
          indexByImeiRef.current.set(imei, idx);
        if (subscribedImeisRef.current.has(imei)) return;
        subscribedImeisRef.current.add(imei);
        ws.send(JSON.stringify({ type: "subscribe", imei }));
        subscribedCount++;
        log("subscribe =>", imei);
      });
      emitStatus("ready", {
        subscribedCount,
        commandChannel: COMMAND_RESPONSE_CHANNEL,
      });
      log("ready", { subscribedCount });
    };

    ws.onerror = (e) => {
      emitStatus("error");
      error("socket error", e);
    };
    ws.onclose = (e) => {
      emitStatus("closed");
      warn("socket closed", { code: e?.code, reason: e?.reason });
    };

    ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        error("failed to parse ws message", e, event?.data);
        return;
      }

      // Fast path: dedicated command channel (handle before GPS flood)
      if (data?.type === "command_response_channel_update" && data.data) {
        cmdChannelBp("recv channel update", {
          imei: data.imei,
          channel: data.channel,
        });
        data = data.data;
      } else if (data?.type === "command_response_channel_subscribed") {
        cmdChannelBp("subscribed ack", { channel: data.channel });
        return;
      } else if (data?.type === "tenant_gps_update" && data.data) {
        data = data.data;
      }

      /* ══════════ COMMAND RESPONSE (priority — before GPS) ══════════ */
      if (
        data.type === "command_response" &&
        data.data?.response &&
        data.data?.imei
      ) {
        const response = data.data.response;
        const imei = data.data.imei;
        const dedupeKey = `${imei}|${response}|${String(data.data?.date || data.data?.packet_date || "")}`;
        if (lastCmdKeyRef.current === dedupeKey) {
          cmdChannelBp("dedupe skip", { imei });
          return;
        }
        lastCmdKeyRef.current = dedupeKey;

        cmdChannelBp("dispatch command_response", { imei, responsePreview: String(response).slice(0, 80) });

        const currentModal = detailsModalRef.current;
        const isModalOpen = currentModal?.show;
        const modalDeviceId = currentModal?.id;
        const modalDevice = carsRef.current.find(
          (car) => car.id === modalDeviceId,
        );
        const modalImei = modalDevice?.serial_number;
        const isMatchingDevice = isModalOpen && modalImei === imei;

        dispatch(setCommandResponse({ response, imei }));

        if (!isMatchingDevice) {
          const car = carsRef.current.find((c) => c.serial_number === imei);
          const carName = car?.name || car?.car_number || "غير معروف";

          toast.success(`${carName}: ${response}`, {
            description: `IMEI: ${imei}`,
            duration: 8000,
            position: "bottom-right",
          });
        }
        return;
      }

      /* ══════════ GPS ══════════ */
      if (data.type === "gps" && (data.data?.imei || data.data?.serial)) {
        const imei = data.data.imei ?? null;
        const serial = data.data.serial ?? null;
        const matchKeys = [imei, serial].filter(Boolean);

        const gps = data.data.gps ?? data.data;
        const latRaw = gps?.latitude ?? gps?.lat;
        const lngRaw = gps?.longitude ?? gps?.lng;
        if (latRaw == null || lngRaw == null) return;

        const lat = parseFloat(latRaw);
        const lng = parseFloat(lngRaw);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        const dateValue = data.data.date ?? gps?.date ?? data.data.packet_date ?? null;
        const packetMs = resolvePacketMs(data, gps, dateValue);
        const nextPos = { lat, lng };
        const nextSpeed = Number(data.data.speed ?? gps?.speed ?? 0) || 0;
        const nextDir = data.data.direction ?? gps?.direction;
        const nextStatus = data.data.statusDecoded?.accOn ? "on" : "off";

        const attrs = pickSocketAttributes(data);
        const nextTelemetry = telemetryFromAttributes(attrs);
        const attrsTypeNum = Number(attrs?.type);
        const nextIgnition = normalizeBool(
          attrs?.ignition ??
            data.data.ignition ??
            data.data.accOn ??
            data.data.acc_status ??
            null,
        );
        const nextMotion = normalizeBool(
          attrs?.motion ?? data.data.motion ?? null,
        );
        const nextCharge = normalizeBool(
          attrs?.charge ?? data.data.charge ?? null,
        );
        // lastSignelGPS يتوافق مع deviceStatus.last_gps_at (gps-server/deviceStatus.js):
        // speed > 0 و attributes.type !== 19
        const shouldUpdateLastSignelGPS =
          nextSpeed > 0 && attrsTypeNum !== 19;

        log("GPS", {
          imei,
          serial,
          lat,
          lng,
          speed: nextSpeed,
          direction: nextDir,
          date: dateValue,
        });

        setCars((prev) => {
          const resolveIndex = () => {
            for (const key of matchKeys) {
              let idx = indexByImeiRef.current.get(key);
              if (idx !== undefined && prev[idx]?.serial_number === key)
                return { idx, key };
              idx = prev.findIndex((c) => c?.serial_number === key);
              if (idx >= 0) {
                indexByImeiRef.current.set(key, idx);
                return { idx, key };
              }
            }
            return { idx: -1, key: null };
          };

          const { idx, key: matchedKey } = resolveIndex();

          const applyUpdate = (car) => {
            if (!car) return car;
            const ignition_on =
              nextIgnition === null ? car.ignition_on : nextIgnition;
            const motion = nextMotion === null ? car.motion : nextMotion;
            const charge = nextCharge === null ? car.charge : nextCharge;
            const telemetry = mergeTelemetry(car, nextTelemetry);

            const lastPacketMs =
              car.lastPacketMs ?? car.lastGpsAtMs ?? 0;
            const effectivePacketMs = packetMs ?? Date.now();
            const isStalePosition =
              lastPacketMs > 0 && effectivePacketMs < lastPacketMs;

            if (isStalePosition) {
              const telemetryOnly = withStickyTelemetry(
                {
                  ...car,
                  ignition_on,
                  motion,
                  charge,
                  lastUpdate: Date.now(),
                },
                nextTelemetry,
              );
              const sameTelemetry =
                telemetryOnly.power === car.power &&
                telemetryOnly.battery === car.battery &&
                telemetryOnly.batteryLevel === car.batteryLevel &&
                telemetryOnly.ignition_on === car.ignition_on &&
                telemetryOnly.motion === car.motion &&
                telemetryOnly.charge === car.charge;
              return sameTelemetry ? car : telemetryOnly;
            }

            const samePos =
              car.position?.lat === nextPos.lat &&
              car.position?.lng === nextPos.lng;
            const sameMeta =
              (Number(car.speed) || 0) === nextSpeed &&
              (car.direction ?? 0) === (nextDir ?? 0) &&
              (car.status ?? "") === nextStatus &&
              (car.ignition_on ?? null) === ignition_on &&
              (car.motion ?? null) === motion &&
              (car.charge ?? null) === charge &&
              (car.power ?? null) === (telemetry.power ?? null) &&
              (car.battery ?? null) === (telemetry.battery ?? null) &&
              (car.batteryLevel ?? null) === (telemetry.batteryLevel ?? null);

            if (samePos && sameMeta) return car;

            const nextLastGpsAtMs = shouldUpdateLastSignelGPS
              ? effectivePacketMs
              : car.lastGpsAtMs;

            return withStickyTelemetry(
              {
                ...car,
                position: nextPos,
                speed: nextSpeed,
                direction: nextDir,
                status: nextStatus,
                ignition_on,
                motion,
                charge,
                lastUpdate: Date.now(),
                lastPacketMs: effectivePacketMs,
                lastSignel: dateValue ?? car.lastSignel,
                lastSignelGPS: shouldUpdateLastSignelGPS
                  ? dateValue ?? car.lastSignelGPS
                  : car.lastSignelGPS,
                lastGpsAtMs: nextLastGpsAtMs,
              },
              nextTelemetry,
            );
          };

          if (idx < 0) {
            warn("GPS for unknown device", {
              matchKeys,
              availableCount: prev?.length || 0,
            });
            return prev;
          }

          const existing = prev[idx];
          if (!existing) return prev;
          const live =
            useFleetStore && existing.id != null
              ? getFleetLive(existing.id)
              : null;
          const base = live
            ? {
                ...existing,
                ...live,
                position: live.position ?? existing.position,
              }
            : existing;
          const updated = applyUpdate(base);

          if (useFleetStore && updated !== base) {
            patchFleetLive(existing.id, {
              position: updated.position,
              speed: updated.speed,
              direction: updated.direction,
              status: updated.status,
              ignition_on: updated.ignition_on,
              motion: updated.motion,
              charge: updated.charge,
              power: updated.power,
              battery: updated.battery,
              batteryLevel: updated.batteryLevel,
              lastUpdate: updated.lastUpdate,
              lastSignel: updated.lastSignel,
              lastSignelGPS: updated.lastSignelGPS,
              lastGpsAtMs: updated.lastGpsAtMs,
              lastPacketMs: updated.lastPacketMs,
              serial_number: existing.serial_number,
            });
          }

          if (!updateCarsOnGps) return prev;
          if (updated === base) return prev;

          const next = prev.slice();
          next[idx] = updated;
          return next;
        });
      }

      /* ══════════ ALARM ══════════ */
      if (data.type === "alarm" && data.data?.imei) {
        const imei = data.data.imei;
        const car = carsRef.current.find((c) => c.serial_number === imei);

        const attrs = pickSocketAttributes(data);
        const nextTelemetry = telemetryFromAttributes(attrs);
        const nextIgnition = normalizeBool(
          attrs?.ignition ??
            data.data.ignition ??
            data.data.accOn ??
            data.data.acc_status ??
            null,
        );
        const nextMotion = normalizeBool(
          attrs?.motion ?? data.data.motion ?? null,
        );
        const nextCharge = normalizeBool(
          attrs?.charge ?? data.data.charge ?? null,
        );

        const hasTelemetry = Object.keys(nextTelemetry).length > 0;
        if (
          nextIgnition !== null ||
          nextMotion !== null ||
          nextCharge !== null ||
          hasTelemetry
        ) {
          setCars((prev) => {
            const idx = prev.findIndex((c) => c?.serial_number === imei);
            if (idx < 0) return prev;
            const existing = prev[idx];
            if (!existing) return prev;
            const next = prev.slice();
            next[idx] = withStickyTelemetry(
              {
                ...existing,
                ignition_on:
                nextIgnition === null ? existing.ignition_on : nextIgnition,
              motion: nextMotion === null ? existing.motion : nextMotion,
                charge: nextCharge === null ? existing.charge : nextCharge,
                lastUpdate: Date.now(),
              },
              nextTelemetry,
            );
            return next;
          });
        }

        // 🔔 صوت
        if (notificationSoundRef.current && alarmAudioRef.current) {
          alarmAudioRef.current.currentTime = 0;
          alarmAudioRef.current.play().catch(() => {});
        }

        const alarmCarName = car?.name || car?.car_number || "غير معروف";
        const alarmText = data.data.alarmTextAr || "غير معروف";
        const alarmSpeed = data.data.speed || 0;
        const alarmDate = data.data.date != null ? String(data.data.date) : "";

        pushAlarmEntry({
          imei,
          carId: car?.id,
          carName: alarmCarName,
          alarmText,
          speed: alarmSpeed,
          date: alarmDate,
        });

        const goToMapHandler = () => {
          const fn = onAlarmSelectCarRef.current;
          const c = carsRef.current.find(
            (x) => String(x?.serial_number) === String(imei),
          );
          if (fn && c) fn(c, true);
          else requestAlarmGoToMap({ imei, carId: car?.id ?? c?.id });
        };

        if (alarmPopupEnabledRef.current) {
          const alarmToastId = `alarm-${Date.now()}-${String(imei).replace(/\W/g, "")}`;

          toast.custom(
            (t) => (
              <AlarmToast
                toastId={t}
                carName={alarmCarName}
                speed={alarmSpeed}
                alarm={alarmText}
                IMEI={imei}
                showGoToMap
                onGoToMap={() => {
                  goToMapHandler();
                  toast.dismiss(alarmToastId);
                }}
              />
            ),
            {
              id: alarmToastId,
              duration: 15000,
              position: "bottom-right",
            },
          );
        }
      }

      /* ══════════ HEARTBEAT ══════════ */
      if (data.type === "heartbeat" && data.data?.imei) {
        setCars((prev) => {
          const key = data.data.imei;
          let idx = indexByImeiRef.current.get(key);
          if (idx !== undefined && prev[idx]?.serial_number !== key)
            idx = undefined;
          if (idx === undefined) {
            idx = prev.findIndex((c) => c?.serial_number === key);
            if (idx >= 0) indexByImeiRef.current.set(key, idx);
          }
          if (idx < 0) return prev;
          const existing = prev[idx];
          if (!existing) return prev;
          const next = prev.slice();
          next[idx] = {
            ...existing,
            voltage: data.data.heartbeat.externalVoltage,
          };
          return next;
        });
      }

      /* ══════════ DEVICE STATUS ══════════ */
      if (data.type === "device" && (data.data?.imei || data.data?.uniqueId)) {
        const imei = (data.data.imei ?? data.data.uniqueId ?? "").toString();
        const status = data.data.status ?? data.data.device_status ?? null;
        const lastUpdate =
          data.data.lastUpdate ?? data.data.device_lastUpdate ?? null;

        setCars((prev) => {
          const idx = prev.findIndex((c) => c?.serial_number === imei);
          if (idx < 0) return prev;
          const existing = prev[idx];
          if (!existing) return prev;

          const nextOffline =
            status === "offline"
              ? true
              : status === "online"
                ? false
                : existing.isOffline;

          const patched = {
            ...existing,
            device_status: status ?? existing.device_status,
            device_lastUpdate: lastUpdate ?? existing.device_lastUpdate,
            isOffline: nextOffline,
            isInactive: false,
            lastSignel:
              existing.lastSignel ?? lastUpdate ?? existing.lastSignel,
            lastUpdate: Date.now(),
          };
          if (useFleetStore) {
            patchFleetLive(existing.id, {
              isOffline: patched.isOffline,
              isInactive: patched.isInactive,
              lastUpdate: patched.lastUpdate,
            });
          }
          const next = prev.slice();
          next[idx] = patched;
          return next;
        });
      }

      // command_response handled above (fast path) — no second handler here
    };

    return () => {
      try {
        if (ws.readyState === WebSocket.OPEN && cmdChannelSubscribedRef.current) {
          ws.send(
            JSON.stringify({
              type: "unsubscribe_command_response_channel",
              channel: COMMAND_RESPONSE_CHANNEL,
            }),
          );
        }
        ws.close();
      } finally {
        if (wsRef.current === ws) wsRef.current = null;
        subscribedImeisRef.current = new Set();
        indexByImeiRef.current = new Map();
        cmdChannelSubscribedRef.current = false;
        emitStatus("closed");
        log("cleanup");
      }
    };
  }, [isInit, enabled, resetKey, useTenantRoom, updateCarsOnGps, useFleetStore]);

  // tenant room: keep IMEI → index map in sync when fleet list changes (no per-device subscribe)
  useEffect(() => {
    if (!useTenantRoom) return;
    (cars || []).forEach((car, idx) => {
      const imei = car?.serial_number;
      if (imei) indexByImeiRef.current.set(imei, idx);
    });
  }, [cars, useTenantRoom]);

  // اشتراك في IMEIs الجديدة بدون reconnect (device-level only)
  useEffect(() => {
    if (useTenantRoom) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    (carsRef.current || []).forEach((car, idx) => {
      const imei = car?.serial_number;
      if (!imei) return;
      if (!indexByImeiRef.current.has(imei))
        indexByImeiRef.current.set(imei, idx);
      if (subscribedImeisRef.current.has(imei)) return;
      subscribedImeisRef.current.add(imei);
      ws.send(JSON.stringify({ type: "subscribe", imei }));
      log("subscribe (late) =>", imei);
    });
  }, [cars?.length, useTenantRoom]);

  return null;
};

export default useCarSocket;
