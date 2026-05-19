import { createSlice } from "@reduxjs/toolkit";

/** مزوّدو خرائط يدعمون تجميع المركبات (clusters) */
export const MAP_PROVIDERS_WITH_CLUSTERS = ["google", "openstreetmap"];

export function mapProviderSupportsClusters(provider) {
  return MAP_PROVIDERS_WITH_CLUSTERS.includes(provider);
}

/** أنواع الخريطة المدعومة في Google Maps */
export const GOOGLE_MAP_TYPES = ["roadmap", "satellite", "terrain", "hybrid"];

export function isGoogleMapType(mapType) {
  return GOOGLE_MAP_TYPES.includes(mapType);
}

const initialState = {
  provider: localStorage.getItem("mapProvider") || "google",
  clusters: false,
  showDeviceName: false,
  mapType: localStorage.getItem("mapType") || "roadmap",
  zoom: 7,
  notificationSound:
    localStorage.getItem("notificationSound") === "false" ? false : true,
  alarmPopupEnabled:
    localStorage.getItem("alarmPopupEnabled") === "false" ? false : true,
};

const mapSlice = createSlice({
  name: "map",
  initialState,
  reducers: {
    // تغيير الـ provider
    switchMap: (state, action) => {
      state.provider = action.payload;
      localStorage.setItem("mapProvider", action.payload);
      state.zoom = 7;

      // لو اخترت mapbox أو openstreetmap نخلي النوع roadmap
      if (
        action.payload === "mapbox" ||
        action.payload === "openstreetmap" ||
        action.payload === "maplibre"
      ) {
        state.mapType = "roadmap";
        localStorage.setItem("mapType", "roadmap");
      }

      if (action.payload === "maptiler") {
        state.mapType = "mt-streets";
        localStorage.setItem("mapType", "mt-streets");
      }

      if (action.payload === "google" && !isGoogleMapType(state.mapType)) {
        state.mapType = "roadmap";
        localStorage.setItem("mapType", "roadmap");
      }

      if (!mapProviderSupportsClusters(action.payload)) {
        state.clusters = false;
      }
    },

    // تغيير نوع الخريطة
    setMapType: (state, action) => {
      state.mapType = action.payload;
      localStorage.setItem("mapType", action.payload);

      // أي نوع غير roadmap يخلي الخريطة جوجل (ما عدا OpenStreetMap)
      if (
        action.payload !== "roadmap" &&
        state.provider !== "openstreetmap" &&
        state.provider !== "maplibre" &&
        state.provider !== "maptiler"
      ) {
        state.provider = "google";
        localStorage.setItem("mapProvider", "google");
      }
    },

    setClusters: (state, action) => {
      state.clusters = action.payload;
    },

    changeZoom: (state, action) => {
      state.zoom = action.payload;
    },

    toggleDeviceName: (state) => {
      state.showDeviceName = !state.showDeviceName;
    },

    toggleNotificationSound: (state) => {
      state.notificationSound = !state.notificationSound;
      localStorage.setItem(
        "notificationSound",
        state.notificationSound ? "true" : "false"
      );
    },

    toggleAlarmPopup: (state) => {
      state.alarmPopupEnabled = !state.alarmPopupEnabled;
      localStorage.setItem(
        "alarmPopupEnabled",
        state.alarmPopupEnabled ? "true" : "false"
      );
    },
  },
});

// toggleClusters بسيط ومتزامن
export const toggleClusters = () => (dispatch, getState) => {
  const { provider, clusters } = getState().map;

  if (!mapProviderSupportsClusters(provider)) return;
  dispatch(setClusters(!clusters));
};

export const {
  switchMap,
  setClusters,
  toggleDeviceName,
  setMapType,
  changeZoom,
  toggleNotificationSound,
  toggleAlarmPopup,
} = mapSlice.actions;

export default mapSlice.reducer;
