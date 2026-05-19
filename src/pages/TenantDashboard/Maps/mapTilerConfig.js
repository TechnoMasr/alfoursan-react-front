/** مفتاح MapTiler — يُفضّل تعريفه في index.html: window.__MAPTILER_KEY__ */
export function getMapTilerApiKey() {
  if (typeof window !== "undefined" && window.__MAPTILER_KEY__) {
    return window.__MAPTILER_KEY__;
  }
  return "iOtnqIEKJQ2UZFnUiKnt";
}

export function getMapTilerStyleUrl(styleId) {
  const key = getMapTilerApiKey();
  return `https://api.maptiler.com/maps/${styleId}/style.json?key=${key}`;
}
