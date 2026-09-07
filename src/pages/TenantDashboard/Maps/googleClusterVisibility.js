/**
 * Diff visible Google marker ids for clusters=true paint (Phase E2b / M1).
 * @param {Set<any>} prevVisible
 * @param {Set<any>} nextVisible
 * @returns {{ toShow: any[], toHide: any[] }}
 */
export function diffVisibleMarkerIds(prevVisible, nextVisible) {
  const prev = prevVisible instanceof Set ? prevVisible : new Set(prevVisible || []);
  const next = nextVisible instanceof Set ? nextVisible : new Set(nextVisible || []);
  const toShow = [];
  const toHide = [];
  next.forEach((id) => {
    if (!prev.has(id)) toShow.push(id);
  });
  prev.forEach((id) => {
    if (!next.has(id)) toHide.push(id);
  });
  return { toShow, toHide };
}
