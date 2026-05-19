import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { useSelector, useDispatch } from "react-redux";
import { clearCommandResponse } from "../../../../store/modalsSlice";
import { useTranslation } from "react-i18next";

import FormBtn from "../../../../components/form/FormBtn";
import MainInput from "../../../../components/form/MainInput";
import { sendCommand } from "../../../../services/monitorServices";
import { getApiErrorMessage } from "../../../../utils/getApiErrorMessage";

const Command = ({ deviceID, deviceSettings, refetch }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch();

  if (!deviceID || !deviceSettings)
    return (
      <p className="text-center py-2 px-4 my-20 w-fit mx-auto rounded-lg bg-primary text-white">
        {t("somethingWentWrong")}
      </p>
    );

  const { commandResponse } = useSelector((state) => state.modals);
  const [activeCommand, setActiveCommand] = useState(0);
  const [selectedCommand, setSelectedCommand] = useState("");
  const [waitingForResponse, setWaitingForResponse] = useState(false);
  const [builderState, setBuilderState] = useState({});

  // التحقق من أن الاستجابة تخص هذا الجهاز
  const deviceImei = deviceSettings?.device?.serial_number;
  const isResponseForThisDevice =
    commandResponse?.response && commandResponse?.imei === deviceImei;
  const deviceStatus = deviceSettings?.device?.device_status;
  const isOffline =
    deviceSettings?.device?.isOffline ??
    (deviceStatus ? deviceStatus !== "online" : true);

  const commandTabs = [
    { label: t("command.remoteOpeningDoor"), isNew: false },
    { label: t("command.engineControl"), isNew: false },
    { label: t("command.queryParameterConfig"), isNew: false },
    { label: t("command.queryLatitudeLongitude"), isNew: false },
    { label: t("command.querySoftwareVersion"), isNew: false },
    { label: t("command.checkStatus"), isNew: false },
    { label: t("command.setSosNumber"), isNew: true },
    { label: t("command.deleteSosNumber"), isNew: true },
    { label: t("command.setCenterNumber"), isNew: true },
    { label: t("command.deleteCenterNumber"), isNew: true },
    { label: t("command.vibrationAlarm"), isNew: true },
    { label: t("command.powerAlarm"), isNew: true },
    { label: t("command.accAlarm"), isNew: true },
    { label: t("command.drivingBehavior"), isNew: true },
    { label: t("command.doorAcControl"), isNew: true },
    // { label: "GSM Jamming", isNew: true },
    { label: t("command.customizedCommand"), isNew: false },
  ];

  const commands = [
    // 0: Remote opening door
    {
      type: "select",
      selectOptions: [
        { value: "CTRDOOR,1#", label: "فتح الباب" },
        { value: "CTRDOOR,0#", label: "اغلاق الباب" },
      ],
      content: null,
      value: null,
    },
    // 1: Engine Control
    {
      type: "select",
      selectOptions: [
        { value: "RELAY,1#", label: "قطع الزيت والكهرباء" },
        { value: "RELAY,0#", label: "إعادة الزيت والكهرباء" },
      ],
      content: null,
      value: null,
    },
    // 2: Query parameter configuration
    {
      type: "static",
      selectOptions: null,
      content:
        "The parameters set of device include device IMEI, upload interval, SOS number, center number, time zone, GPRS switch, IP domain name and port number, etc.",
      value: "PARAM#",
    },
    // 3: Query latitude and longitude
    {
      type: "static",
      selectOptions: null,
      content: "The device re-reports a new location information",
      value: "WHERE#",
    },
    // 4: Query software version
    {
      type: "static",
      selectOptions: null,
      content: "Current device program version",
      value: "VERSION#",
    },
    // 5: Check Status
    {
      type: "static",
      selectOptions: null,
      content:
        "The current status of device, including GPRS connection status, whether external power is connected, voltage value, GSM signal strength, GPS status, etc.",
      value: "STATUS#",
    },
    // 6: Set SOS Number (NEW) -> SOS,A,[phone1][,phone2][,phone3]#
    {
      type: "builder",
      builderId: "sos_set",
      selectOptions: null,
      content:
        "Add SOS number(s). You can set up to 3 SOS numbers at the same time.\nFormat: SOS,A,[phone1][,phone2][,phone3]#\nExample: SOS,A,13122012031,13122012032#",
      value: null,
    },
    // 7: Delete SOS Number (NEW) -> SOS,D,[seq...]# or SOS,D,[phone...]#
    {
      type: "builder",
      builderId: "sos_delete",
      selectOptions: null,
      content:
        "Delete SOS number(s) by sequence number(s) or by phone number(s).\nFormats:\n- SOS,D,[sequence1][,sequence2][,sequence3]#\n- SOS,D,[phone1][,phone2][,phone3]#\nExample: SOS,D,2#",
      value: null,
    },
    // 8: Set Center Number (NEW) -> CENTER,A,[phone]#
    {
      type: "builder",
      builderId: "center_set",
      selectOptions: null,
      content:
        "Set center number. Only one center number can be set.\nFormat: CENTER,A,[phone]#\nExample: CENTER,A,13122012031#",
      value: null,
    },
    // 9: Delete Center Number (NEW) -> CENTER,D#
    {
      type: "static",
      selectOptions: null,
      content: "Delete center number.\nFormat: CENTER,D#\nExample: CENTER,D#",
      value: "CENTER,D#",
    },
    // 10: Vibration Alarm (NEW)
    {
      type: "select",
      selectOptions: [
        { value: "SENALM,ON,0#", label: "تفعيل تنبيه الاهتزاز (GPRS فقط)" },
        { value: "SENALM,ON,1#", label: "تفعيل تنبيه الاهتزاز (SMS+GPRS)" },
        {
          value: "SENALM,ON,2#",
          label: "تفعيل تنبيه الاهتزاز (GPRS+SMS+PHONE)",
        },
        { value: "SENALM,ON,3#", label: "تفعيل تنبيه الاهتزاز (GPRS+PHONE)" },
        { value: "SENALM,FULL,1#", label: "تفعيل كامل (يعمل حتى مع ACC ON)" },
        { value: "SENALM,OFF#", label: "إيقاف تنبيه الاهتزاز" },

        
        { value: "SENALM#", label: "استعلام إعدادات تنبيه الاهتزاز" },
        { value: "SENLEVEL,1#", label: "حساسية الاهتزاز: 1 (أعلى حساسية)" },
        { value: "SENLEVEL,3#", label: "حساسية الاهتزاز: 3" },
        { value: "SENLEVEL,5#", label: "حساسية الاهتزاز: 5 (افتراضي)" },
        { value: "SENLEVEL,7#", label: "حساسية الاهتزاز: 7" },
        { value: "SENLEVEL,10#", label: "حساسية الاهتزاز: 10 (أقل حساسية)" },
        { value: "SENLEVEL#", label: "استعلام مستوى حساسية الاهتزاز" },
      ],
      content:
        "تنبيه الاهتزاز: يرسل تنبيه عند اكتشاف اهتزاز. OFF=إيقاف، ON=تفعيل (لا يعمل مع ACC ON)، FULL=تفعيل كامل. الحساسية من 1-10 (الأقل = أكثر حساسية).",
      value: null,
    },
    // 11: Power Alarm (NEW)
    {
      type: "select",
      selectOptions: [
        {
          value: "POWERALM,ON,0#",
          label: "تفعيل تنبيه انقطاع الطاقة (GPRS فقط)",
        },
        {
          value: "POWERALM,ON,1#",
          label: "تفعيل تنبيه انقطاع الطاقة (SMS+GPRS)",
        },
        {
          value: "POWERALM,ON,2#",
          label: "تفعيل تنبيه انقطاع الطاقة (GPRS+SMS+PHONE)",
        },
        {
          value: "POWERALM,ON,3#",
          label: "تفعيل تنبيه انقطاع الطاقة (GPRS+PHONE)",
        },
        { value: "POWERALM,OFF#", label: "إيقاف تنبيه انقطاع الطاقة" },
        { value: "POWERALM#", label: "استعلام إعدادات تنبيه انقطاع الطاقة" },
      ],
      content:
        "تنبيه انقطاع الطاقة: يرسل تنبيه عند فصل الطاقة الخارجية عن الجهاز. مفعّل افتراضياً.",
      value: null,
    },
    // 12: ACC Alarm (NEW)
    {
      type: "select",
      selectOptions: [
        { value: "ACCALM,ON,1,0#", label: "تنبيه ACC ON فقط (GPRS)" },
        { value: "ACCALM,ON,2,0#", label: "تنبيه ACC OFF فقط (GPRS)" },
        { value: "ACCALM,ON,3,0#", label: "تنبيه ACC ON و OFF (GPRS)" },
        { value: "ACCALM,ON,1,1#", label: "تنبيه ACC ON فقط (SMS+GPRS)" },
        { value: "ACCALM,ON,2,1#", label: "تنبيه ACC OFF فقط (SMS+GPRS)" },
        { value: "ACCALM,ON,3,1#", label: "تنبيه ACC ON و OFF (SMS+GPRS)" },
        { value: "ACCALM,OFF#", label: "إيقاف تنبيه ACC" },
        { value: "ACCALM#", label: "استعلام إعدادات تنبيه ACC" },
      ],
      content:
        "تنبيه ACC: يرسل تنبيه عند تشغيل/إيقاف المحرك (ACC ON/OFF). B=1: ACC ON، B=2: ACC OFF، B=3: كلاهما.",
      value: null,
    },
    // 13: Driving Behavior (NEW)
    {
      type: "select",
      selectOptions: [
        // Rapid Acceleration
        // { value: "EACCELE,3,1#", label: "تنبيه التسارع المفاجئ (3 م/ث²)" },
        // { value: "EACCELE,5,1#", label: "تنبيه التسارع المفاجئ (5 م/ث²)" },
        // { value: "EACCELE,0,0#", label: "إيقاف تنبيه التسارع المفاجئ" },
        { value: "EACCELE#", label: "استعلام إعدادات التسارع المفاجئ" },
        // Rapid Deceleration
        { value: "EDECELE,3,1#", label: "تنبيه التباطؤ المفاجئ (3 م/ث²)" },
        { value: "EDECELE,5,1#", label: "تنبيه التباطؤ المفاجئ (5 م/ث²)" },
        { value: "EDECELE,0,0#", label: "إيقاف تنبيه التباطؤ المفاجئ" },
        { value: "EDECELE#", label: "استعلام إعدادات التباطؤ المفاجئ" },
        // Sharp Turn
        { value: "EANGLE,5,1#", label: "تنبيه الانعطاف الحاد (5 م/ث²)" },
        { value: "EANGLE,7,1#", label: "تنبيه الانعطاف الحاد (7 م/ث²)" },
        { value: "EANGLE,0,0#", label: "إيقاف تنبيه الانعطاف الحاد" },
        { value: "EANGLE#", label: "استعلام إعدادات الانعطاف الحاد" },
        // Collision
        { value: "ECOLLI,12,1#", label: "تنبيه التصادم (12 - حساسية عالية)" },
        { value: "ECOLLI,15,1#", label: "تنبيه التصادم (15 - حساسية متوسطة)" },
        { value: "ECOLLI,18,1#", label: "تنبيه التصادم (18 - حساسية منخفضة)" },
        { value: "ECOLLI,0,0#", label: "إيقاف تنبيه التصادم" },
        { value: "ECOLLI#", label: "استعلام إعدادات التصادم" },
      ],
      content:
        "تنبيهات سلوك القيادة: التسارع المفاجئ (2-10 م/ث²)، التباطؤ المفاجئ (3-10 م/ث²)، الانعطاف الحاد (3-15 م/ث²)، التصادم (10-25). القيمة الأصغر = حساسية أعلى.",
      value: null,
    },
    // 14: Door & AC Control (NEW)
    {
      type: "select",
      selectOptions: [
        // Extended Function Mode
        { value: "EXTENSIONS,1#", label: "وضع: تنبيه مفتاح التكييف" },
        {
          value: "EXTENSIONS,2#",
          label: "وضع: تنبيه فتح/إغلاق الباب (افتراضي)",
        },
        { value: "EXTENSIONS#", label: "استعلام وضع الوظائف الممتدة" },
        // Remote Door
        { value: "CTRDOOR,1#", label: "فتح الباب عن بعد" },
        { value: "CTRDOOR,0#", label: "إغلاق الباب عن بعد" },
        // Door Alarm
        { value: "CDALM,ON,1,1#", label: "تنبيه فتح الباب" },
        { value: "CDALM,ON,2,1#", label: "تنبيه إغلاق الباب" },
        { value: "CDALM,ON,3,1#", label: "تنبيه فتح وإغلاق الباب" },
        { value: "CDALM,OFF#", label: "إيقاف تنبيه الباب" },
        { value: "CDALM#", label: "استعلام إعدادات تنبيه الباب" },
        // AC Alarm
        { value: "ACALM,ON,1,1#", label: "تنبيه تشغيل التكييف" },
        { value: "ACALM,ON,2,1#", label: "تنبيه إيقاف التكييف" },
        { value: "ACALM,ON,3,1#", label: "تنبيه تشغيل وإيقاف التكييف" },
        { value: "ACALM,OFF#", label: "إيقاف تنبيه التكييف" },
        { value: "ACALM#", label: "استعلام إعدادات تنبيه التكييف" },
      ],
      content:
        "التحكم بالباب والتكييف: فتح/إغلاق الباب عن بعد، تنبيهات الباب (B=1: فتح، B=2: إغلاق، B=3: كلاهما)، تنبيهات التكييف.",
      value: null,
    },
    // 11: GSM Jamming (NEW)

    /*
    {
      type: "select",
      selectOptions: [
        { value: "JAMALM,ON,30,0,0#", label: "تفعيل كشف التشويش (بدون قطع الوقود)" },
        { value: "JAMALM,ON,30,1,0#", label: "تفعيل + قطع الوقود (سرعة < 20 كم/س)" },
        { value: "JAMALM,ON,30,2,0#", label: "تفعيل + قطع الوقود فوري" },
        { value: "JAMALM,ON,30,3,0#", label: "تفعيل + قطع الوقود (ACC OFF فقط)" },
        { value: "JAMALM,ON,10,1,1#", label: "كشف سريع 10ث + قطع + SMS" },
        { value: "JAMALM,OFF#", label: "إيقاف كشف التشويش" },
        { value: "JAMALM#", label: "استعلام إعدادات كشف التشويش" },
      ],
      content: "كشف تشويش GSM: يكتشف أجهزة التشويش ويمكنه قطع الوقود تلقائياً. T=وقت الكشف بالثواني، N=0: بدون قطع، N=1: قطع عند سرعة<20، N=2: قطع فوري، N=3: قطع في ACC OFF فقط. يعود الوقود بعد 1 دقيقة من استعادة الإشارة.",
      value: null,
    },
*/

    // 15: Customized Command
    {
      type: "customized",
      selectOptions: null,
      content: null,
      value: null,
    },
  ];

  const getBuilderValue = () => builderState?.[activeCommand] || {};
  const setBuilderValue = (patch) => {
    setBuilderState((prev) => ({
      ...prev,
      [activeCommand]: {
        ...(prev?.[activeCommand] || {}),
        ...patch,
      },
    }));
  };

  const buildCommandFromBuilder = () => {
    const cmd = commands[activeCommand];
    const v = getBuilderValue();

    if (cmd.builderId === "sos_set") {
      const phones = [v.phone1, v.phone2, v.phone3]
        .map((x) => String(x || "").trim())
        .filter(Boolean);
      if (!phones.length) return "";
      return `SOS,A,${phones.join(",")}#`;
    }

    if (cmd.builderId === "sos_delete") {
      const mode = v.mode || "seq"; // 'seq' | 'phone'
      const raw = String(v.values || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!raw.length) return "";
      if (mode === "seq") {
        const seqs = raw
          .map((x) => Number.parseInt(x, 10))
          .filter((n) => Number.isFinite(n) && n > 0);
        if (!seqs.length) return "";
        return `SOS,D,${seqs.join(",")}#`;
      }
      // by phone
      return `SOS,D,${raw.join(",")}#`;
    }

    if (cmd.builderId === "center_set") {
      const phone = String(v.phone || "").trim();
      if (!phone) return "";
      return `CENTER,A,${phone}#`;
    }

    return "";
  };

  // ✅ عند استلام الاستجابة، إلغاء حالة الانتظار
  useEffect(() => {
    if (isResponseForThisDevice) {
      setWaitingForResponse(false);
      const timer = setTimeout(() => {
        dispatch(clearCommandResponse());
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [isResponseForThisDevice, dispatch]);

  // ✅ mutation لإرسال الأمر
  const { mutate, isPending } = useMutation({
    mutationFn: sendCommand,
    onSuccess: () => {
      toast.success(t("command.commandSentSuccess"));
      setSelectedCommand("");
      // مسح أي استجابة سابقة وبدء انتظار الاستجابة
      dispatch(clearCommandResponse());
      setWaitingForResponse(true);
      refetch();
    },
    onError: (error) => {
      console.error(error);
      const message = getApiErrorMessage(error, t);
      toast.error(message);
      setWaitingForResponse(false);
    },
  });

  // ✅ إرسال البيانات
  const handleSubmit = (e) => {
    e.preventDefault();
    if (isOffline) {
      toast.warn(t("command.deviceOffline"));
      return;
    }

    let commandValue = selectedCommand;

    // في حالة static أوامر
    if (commands[activeCommand].type === "static") {
      commandValue = commands[activeCommand].value;
    }

    if (commands[activeCommand].type === "builder") {
      commandValue = buildCommandFromBuilder();
    }

    // تحقق من الإدخال
    if (!commandValue) {
      toast.warn(t("command.selectCommandFirst"));
      return;
    }

    const payload = {
      device_id: deviceID,
      command: commandValue,
    };

    mutate(payload);
  };

  return (
    <section className="flex gap-2">
      {/* ✅ القائمة اليمنى */}
      <aside className="flex flex-col p-4 gap-2 max-h-[60vh] overflow-y-auto">
        {commandTabs.map((cmd, index) => (
          <button
            key={index}
            onClick={() => setActiveCommand(index)}
            className={`px-3 py-2 text-sm text-start rounded transition-all whitespace-nowrap cursor-pointer
            flex items-center gap-2 ${
              activeCommand === index
                ? "text-mainColor border-e-4 border-mainColor bg-mainColor/10"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            }`}
          >
            {cmd.label}
            {cmd.isNew && (
              <span className="bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                {t("command.new")}
              </span>
            )}
          </button>
        ))}
      </aside>

      {/* ✅ منطقة المحتوى */}
      <div className="flex-1">
        <form className="space-y-4 max-w-xl" onSubmit={handleSubmit}>
          {isOffline && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {t("command.deviceOfflineHint")}
            </div>
          )}
          {commands[activeCommand].type === "select" && (
            <>
              {/* ✅ وصف الأمر إن وجد */}
              {commands[activeCommand].content && (
                <p className="text-gray-600 bg-blue-50 border border-blue-200 p-3 rounded-lg text-xs mb-3 leading-relaxed">
                  💡 {commands[activeCommand].content}
                </p>
              )}
              <MainInput
                type="select"
                id="command"
                label={t("command.commands")}
                options={[
                  { value: "", label: t("command.selectCommand") },
                  ...commands[activeCommand].selectOptions,
                ]}
                value={selectedCommand}
                onChange={(e) => setSelectedCommand(e.target.value)}
              />
            </>
          )}

          {commands[activeCommand].type === "static" && (
            <>
              <p className="text-gray-600 bg-mainColor/10 p-2 rounded-lg text-sm">
                {commands[activeCommand].content}
              </p>
            </>
          )}

          {commands[activeCommand].type === "customized" && (
            <MainInput
              id="command"
              label={t("command.commands")}
              placeholder={t("command.writeCustomCommand")}
              value={selectedCommand}
              onChange={(e) => setSelectedCommand(e.target.value)}
            />
          )}

          {commands[activeCommand].type === "builder" && (
            <>
              {commands[activeCommand].content && (
                <p className="text-gray-600 bg-blue-50 border border-blue-200 p-3 rounded-lg text-xs mb-3 leading-relaxed whitespace-pre-line">
                  💡 {commands[activeCommand].content}
                </p>
              )}

              {commands[activeCommand].builderId === "sos_set" && (
                <div className="grid grid-cols-1 gap-2">
                  <MainInput
                    id="sos_phone_1"
                    label={t("command.sosPhone1")}
                    placeholder="13122012031"
                    value={getBuilderValue().phone1 || ""}
                    onChange={(e) =>
                      setBuilderValue({ phone1: e.target.value })
                    }
                  />
                  <MainInput
                    id="sos_phone_2"
                    label={t("command.sosPhone2")}
                    placeholder="13122012032"
                    value={getBuilderValue().phone2 || ""}
                    onChange={(e) =>
                      setBuilderValue({ phone2: e.target.value })
                    }
                  />
                  <MainInput
                    id="sos_phone_3"
                    label={t("command.sosPhone3")}
                    placeholder="13122012033"
                    value={getBuilderValue().phone3 || ""}
                    onChange={(e) =>
                      setBuilderValue({ phone3: e.target.value })
                    }
                  />
                  <div className="text-xs text-gray-500">
                    {t("command.willBeSentAs")}{" "}
                    <span className="font-mono">
                      SOS,A,phone1[,phone2][,phone3]#
                    </span>
                  </div>
                </div>
              )}

              {commands[activeCommand].builderId === "sos_delete" && (
                <div className="space-y-2">
                  <MainInput
                    type="select"
                    id="sos_delete_mode"
                    label={t("command.deleteMethod")}
                    options={[
                      { value: "seq", label: t("command.bySequence") },
                      { value: "phone", label: t("command.byPhone") },
                    ]}
                    value={getBuilderValue().mode || "seq"}
                    onChange={(e) => setBuilderValue({ mode: e.target.value })}
                  />
                  <MainInput
                    id="sos_delete_values"
                    label={
                      getBuilderValue().mode === "phone"
                        ? t("command.phoneNumbers")
                        : t("command.sequenceNumbers")
                    }
                    placeholder={
                      getBuilderValue().mode === "phone"
                        ? t("command.examplePhoneNumbers")
                        : t("command.exampleSequenceNumbers")
                    }
                    value={getBuilderValue().values || ""}
                    onChange={(e) =>
                      setBuilderValue({ values: e.target.value })
                    }
                  />
                  <div className="text-xs text-gray-500">
                    {t("command.willBeSentAs")}{" "}
                    <span className="font-mono">
                      SOS,D,
                      {getBuilderValue().mode === "phone"
                        ? t("command.phone1")
                        : t("command.sequence1")}
                      ,
                      {getBuilderValue().mode === "phone"
                        ? t("command.phone2")
                        : t("command.sequence2")}
                      ,
                      {getBuilderValue().mode === "phone"
                        ? t("command.phone3")
                        : t("command.sequence3")}
                      #
                    </span>
                  </div>
                </div>
              )}

              {commands[activeCommand].builderId === "center_set" && (
                <div className="space-y-2">
                  <MainInput
                    id="center_phone"
                    label={t("command.centerPhoneNumber")}
                    placeholder="13122012031"
                    value={getBuilderValue().phone || ""}
                    onChange={(e) => setBuilderValue({ phone: e.target.value })}
                  />
                  <div className="text-xs text-gray-500">
                    {t("command.willBeSentAs")}{" "}
                    <span className="font-mono">CENTER,A,phone#</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ✅ عرض Loader أثناء انتظار الاستجابة */}
          {waitingForResponse && !isResponseForThisDevice && (
            <div className="mb-4 p-4 bg-linear-to-r from-blue-50 to-indigo-50 border-r-4 border-blue-500 rounded-lg shadow-md animate-fade-in-up">
              <div className="flex items-center gap-3">
                <div className="shrink-0">
                  <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-blue-700 text-sm mb-1">
                    {t("command.waitingForResponse")}
                  </h4>
                  <p className="text-gray-600 text-xs">
                    {t("command.waitingForDeviceResponse")}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ✅ عرض استجابة الأمر */}
          {isResponseForThisDevice && (
            <div className="mb-4 p-4 bg-linear-to-r from-green-50 to-emerald-50 border-r-4 border-green-500 rounded-lg shadow-md animate-fade-in-up">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <svg
                      className="w-5 h-5 text-green-600 animate-pulse"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <h4 className="font-bold text-green-700 text-sm">
                      {t("command.commandResponse")}
                    </h4>
                  </div>
                  <p className="text-gray-800 text-sm break-all font-mono bg-white/50 p-2 rounded border border-green-200">
                    {commandResponse.response}
                  </p>
                </div>
                <button
                  onClick={() => {
                    dispatch(clearCommandResponse());
                    setWaitingForResponse(false);
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                  aria-label={t("command.close")}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
          )}

          <FormBtn
            title={t("command.sendCommand")}
            variant="success"
            loading={isPending}
            disabled={isOffline}
          />
        </form>
      </div>
    </section>
  );
};

export default Command;
