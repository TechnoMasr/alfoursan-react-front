import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useState } from "react";
import { FaSearch, FaRegCircle } from "react-icons/fa";
import { PiPolygon, PiPolygonFill } from "react-icons/pi";
import { MdDelete, MdContentCopy, MdEdit } from "react-icons/md";
import { LuSquareSplitHorizontal } from "react-icons/lu";
import { useDispatch, useSelector } from "react-redux";
import {
  closePolygonMenu,
  openAssociateDeviceModal,
  openGeoFenceModal,
  openPolygonMenu,
} from "../../store/modalsSlice";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  getFences,
  deleteFences,
  destroyFences,
} from "../../services/fencesServices";
import Loader from "../Loading/Loader";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";

const PolygonMenu = ({ onDrawSelect }) => {
  const { t } = useTranslation();
  const [drawType, setDrawType] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const [activeRowId, setActiveRowId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const dispatch = useDispatch();
  const { polygonMenu } = useSelector((state) => state.modals);

  const {
    data: fences = { items: [] },
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["fences", polygonMenu.show],
    queryFn: getFences,
  });

  const filteredFences = fences?.items.filter((fence) =>
    fence.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // ✅ Mutation لحذف عنصر واحد
  const deleteMutation = useMutation({
    mutationFn: deleteFences,
    onSuccess: () => {
      toast.success(t("polygonMenu.deleteSuccess"));
      refetch();
    },
    onError: (error) => toast.error(error?.response?.data?.message),
  });

  // ✅ Mutation لحذف مجموعة عناصر
  const destroyMutation = useMutation({
    mutationFn: destroyFences,
    onSuccess: () => {
      toast.success(t("polygonMenu.batchDeleteSuccess"));
      setSelectedIds([]);
      setSelectAll(false);
      refetch();
    },
    onError: (error) => toast.error(error?.response?.data?.message),
  });

  // ✅ عند الضغط على زر رسم
  const handleSelect = (type) => {
    setDrawType(type);
    if (onDrawSelect) {
      if (onDrawSelect(type) === false) return;
      handleClose();
      return;
    }
    const event = new CustomEvent("start-drawing", { detail: { type } });
    window.dispatchEvent(event);
    handleClose();
  };

  // ✅ تحديد / إلغاء كل الصفوف
  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedIds([]);
    } else {
      const allIds = fences.items.map((f) => f.id);
      setSelectedIds(allIds);
    }
    setSelectAll(!selectAll);
  };

  // ✅ تحديد صف واحد
  const handleRowSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  // ✅ حذف عنصر واحد
  const handleDelete = (id) => {
    if (confirm(t("polygonMenu.confirmDelete"))) {
      deleteMutation.mutate(id);
    }
  };

  // ✅ حذف مجموعة عناصر
  const handleBatchDelete = () => {
    if (selectedIds.length === 0)
      return toast.warning(t("polygonMenu.selectAtLeastOne"));

    if (confirm(t("polygonMenu.confirmBatchDelete"))) {
      destroyMutation.mutate(selectedIds);
    }
  };

  const handleOpenChange = (isOpen) => {
    if (isOpen) dispatch(openPolygonMenu());
    else dispatch(closePolygonMenu());
  };

  const handleRowClick = (fence) => {
    setActiveRowId(fence.id);

    if (fence.type === "polygon" && fence.coordinates) {
      // ✅ تحويل الـ [lat, lng] إلى [{ lat, lng }]
      const polygonData = fence.coordinates.map(([lat, lng]) => ({
        lat,
        lng,
      }));

      const event = new CustomEvent("edit-shape", {
        detail: {
          type: "polygon",
          polygonData,
          center: null,
          radius: null,
        },
      });
      window.dispatchEvent(event);
    } else if (fence.type === "circle") {
      const event = new CustomEvent("edit-shape", {
        detail: {
          type: "circle",
          polygonData: [],
          center: { lat: fence.latitude, lng: fence.longitude },
          radius: fence.radius,
        },
      });
      window.dispatchEvent(event);
    }
  };

  const handleShowAll = () => {
    if (!fences?.items || fences.items.length === 0) {
      return toast.warning(t("polygonMenu.noFencesToShow"));
    }

    const event = new CustomEvent("show-all-polygons", {
      detail: { fences: fences.items },
    });
    window.dispatchEvent(event);

    // toast.success(`تم عرض ${fences.items.length} سياج على الخريطة 🗺️`);
  };

  const handleClose = () => {
    window.dispatchEvent(new Event("clear-shape"));
    dispatch(closePolygonMenu());
    setActiveRowId(null);
    setSelectedIds([]);
    setSelectAll(false);
    setDrawType("");
    if (window.allShapes) {
      window.allShapes.forEach((shape) => shape.setMap(null));
      window.allShapes = [];
    }
  };

  const lang = window.__LANG__ || "ar";

  return (
    <DropdownMenu.Root open={polygonMenu.show} onOpenChange={handleOpenChange}>
      {/* زر الفتح */}
      <DropdownMenu.Trigger asChild>
        <div
          onClick={() => handleOpenChange(!polygonMenu.show)}
          className="bg-white shadow rounded p-2 cursor-pointer hover:bg-gray-100"
        >
          <PiPolygon className="text-xl text-gray-700" />
        </div>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="left"
          align="start"
          sideOffset={5}
          className="bg-white shadow-xl rounded-xl w-80 p-4 z-50 space-y-4"
          // ❌ اشيل الـ preventDefault
          onPointerDownOutside={(e) => e.stopPropagation()}
          dir={lang === "ar" ? "rtl" : "ltr"}
        >
          {/* ✅ العنوان + زر الإغلاق */}
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">{t("polygonMenu.title")}</h3>
            <button
              onClick={handleClose}
              className="text-gray-500 hover:text-red-500 text-lg font-bold"
            >
              ✕
            </button>
          </div>

          {/* باقي المحتوى بدون تغيير */}
          {/* Draw Fence */}
          <div className="flex items-center gap-2">
            <label className="font-medium">{t("polygonMenu.drawFence")}</label>
            <div className="flex gap-2 items-center">
              <button
                onClick={() => handleSelect("circle")}
                className="py-2 px-4 rounded-md border border-gray-400 cursor-pointer text-lg hover:bg-gray-100"
              >
                <FaRegCircle />
              </button>
              <button
                onClick={() => handleSelect("polygon")}
                className="py-2 px-4 rounded-md border border-gray-400 cursor-pointer text-lg hover:bg-gray-100"
              >
                <PiPolygonFill />
              </button>
            </div>
          </div>

          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              placeholder={t("polygonMenu.searchByName")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2.5 pr-10 bg-gray-50 border border-gray-200 rounded-lg text-sm 
                focus:outline-none focus:ring-2 focus:ring-mainColor/40 focus:border-mainColor transition-all"
            />
            <FaSearch className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
          </div>

          {isLoading ? (
            <div className="py-8">
              <Loader />
            </div>
          ) : filteredFences?.length === 0 ? (
            <div className="py-8 text-center text-gray-600 font-semibold">
              {t("polygonMenu.noFences")}
            </div>
          ) : (
            <>
              {/* Actions */}
              {filteredFences?.length > 0 && (
                <div className="flex justify-between text-xs mb-2">
                  <button
                    className="hover:underline cursor-pointer text-mainColor"
                    onClick={handleShowAll}
                  >
                    {t("polygonMenu.showAll")}
                  </button>
                  <div className="flex gap-3">
                    <button
                      className="hover:underline cursor-pointer text-red-500"
                      onClick={handleBatchDelete}
                      disabled={destroyMutation.isPending}
                    >
                      {destroyMutation.isPending
                        ? t("polygonMenu.deleting")
                        : t("polygonMenu.batchDelete")}
                    </button>
                  </div>
                </div>
              )}

              {/* Table */}
              <div className="overflow-y-auto max-h-52! rounded-md">
                <table className="table table-zebra w-full text-xs">
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          className="checkbox checkbox-xs checkbox-primary"
                          checked={selectAll}
                          onChange={handleSelectAll}
                        />
                      </th>
                      <th>{t("polygonMenu.name")}</th>
                      <th>{t("polygonMenu.operate")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fences?.items.map((fence) => (
                      <tr
                        key={fence.id}
                        className={`cursor-pointer ${
                          activeRowId === fence.id
                            ? "bg-mainColor/10 border-l-4 border-l-mainColor"
                            : "hover:bg-gray-100"
                        }`}
                        onClick={() => handleRowClick(fence)}
                      >
                        <td>
                          <input
                            type="checkbox"
                            className="checkbox checkbox-xs checkbox-primary"
                            checked={selectedIds.includes(fence.id)}
                            onChange={() => handleRowSelect(fence.id)}
                          />
                        </td>
                        <td>{fence.name}</td>
                        <td className="flex gap-2">
                          <MdEdit
                            onClick={() =>
                              dispatch(
                                openGeoFenceModal({
                                  fenceData: fence,
                                  mission: "edit",
                                }),
                              )
                            }
                            className="text-sm cursor-pointer text-mainColor hover:text-mainColor"
                          />
                          <MdContentCopy
                            onClick={() =>
                              dispatch(
                                openGeoFenceModal({
                                  fenceData: fence,
                                  mission: "copy",
                                }),
                              )
                            }
                            className="text-sm cursor-pointer text-gray-500 hover:text-gray-700"
                          />
                          <LuSquareSplitHorizontal
                            onClick={() =>
                              dispatch(
                                openAssociateDeviceModal({ id: fence.id }),
                              )
                            }
                            className="text-sm cursor-pointer text-gray-500 hover:text-gray-700"
                          />
                          <MdDelete
                            onClick={() => handleDelete(fence.id)}
                            className="text-sm cursor-pointer text-red-500 hover:text-red-700"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

export default PolygonMenu;
