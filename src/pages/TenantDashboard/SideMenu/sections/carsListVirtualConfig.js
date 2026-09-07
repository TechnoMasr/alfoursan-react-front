/** Fixed vertical stride for CarsList virtualization (row + former gap-1). */
export const CAR_LIST_ROW_STRIDE_PX = 48;

/** Extra rows above/below the viewport. */
export const CAR_LIST_OVERSCAN = 10;

/**
 * Index of selected vehicle in the filtered list, or -1 if absent (scroll no-op).
 * @param {Array<{ id?: string|number }>|null|undefined} cars
 * @param {string|number|null|undefined} selectedCarId
 */
export function findSelectedCarIndex(cars, selectedCarId) {
  if (selectedCarId == null || !Array.isArray(cars) || cars.length === 0) {
    return -1;
  }
  return cars.findIndex((c) => c?.id === selectedCarId);
}
