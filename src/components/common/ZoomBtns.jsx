import { FiMinus, FiPlus } from "react-icons/fi";
import { useDispatch, useSelector } from "react-redux";
import { changeZoom } from "../../store/mapSlice";

const ZoomBtns = ({ mapProvider, setViewState }) => {
  const dispatch = useDispatch();
  const { zoom } = useSelector((state) => state.map); // نجيب الزوم من الـ store

  const handleZoomIn = () => {
    const newZoom = Math.min(zoom + 1, 20); // أقصى زوم 20
    dispatch(changeZoom(newZoom));
    if (
      mapProvider === "mapbox" ||
      mapProvider === "maplibre" ||
      mapProvider === "maptiler"
    ) {
      setViewState((v) => ({ ...v, zoom: newZoom }));
    }
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoom - 1, 2); // أقل زوم 2
    dispatch(changeZoom(newZoom));
    if (
      mapProvider === "mapbox" ||
      mapProvider === "maplibre" ||
      mapProvider === "maptiler"
    ) {
      setViewState((v) => ({ ...v, zoom: newZoom }));
    }
  };

  return (
    <div className="bg-white shadow rounded overflow-hidden flex flex-col">
      <button
        onClick={handleZoomIn}
        className="p-2 cursor-pointer hover:bg-gray-100"
      >
        <FiPlus className="text-xl text-gray-700" />
      </button>

      <button
        onClick={handleZoomOut}
        className="p-2 cursor-pointer hover:bg-gray-100"
      >
        <FiMinus className="text-xl text-gray-700" />
      </button>
    </div>
  );
};

export default ZoomBtns;
