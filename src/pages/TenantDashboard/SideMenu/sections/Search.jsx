import { useState, useMemo, useRef, useEffect } from "react";
import { IoSearchOutline } from "react-icons/io5";
import { useTranslation } from "react-i18next";

const Search = ({ cars, handleSelectCar }) => {
  const { t } = useTranslation();
  const [searchKey, setSearchKey] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const listRef = useRef(null);
  const itemRefs = useRef([]);

  // فلترة العربيات حسب الاسم أو رقم الشريحة
  const filteredCars = useMemo(() => {
    if (!searchKey.trim()) return [];
    return cars.filter(
      (car) =>
        car.name?.toLowerCase().includes(searchKey.toLowerCase()) ||
        car.iccid?.toLowerCase().includes(searchKey.toLowerCase()) ||
        car.serial_number?.toLowerCase().includes(searchKey.toLowerCase()) ||
        car.carnum?.toLowerCase().includes(searchKey.toLowerCase()) ||
        car.sim_number?.toLowerCase().includes(searchKey.toLowerCase())
    );
  }, [cars, searchKey]);

  // عند تغيّر النتائج: تحديد أول عنصر أو إلغاء التحديد
  useEffect(() => {
    itemRefs.current = [];
    if (filteredCars.length > 0) {
      setHighlightedIndex(0);
    } else {
      setHighlightedIndex(-1);
    }
  }, [filteredCars.length, searchKey]);

  // تمرير القائمة لإظهار العنصر المحدّد
  useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return;
    const el = itemRefs.current[highlightedIndex];
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightedIndex]);

  const selectCar = (car) => {
    if (!car) return;
    handleSelectCar(car, true);
    setSearchKey("");
    setIsFocused(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e) => {
    if (!isFocused || filteredCars.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((i) =>
          i < filteredCars.length - 1 ? i + 1 : i
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((i) => (i > 0 ? i - 1 : 0));
        break;
      case "Enter":
        e.preventDefault();
        selectCar(
          filteredCars[highlightedIndex >= 0 ? highlightedIndex : 0]
        );
        break;
      case "Escape":
        e.preventDefault();
        setIsFocused(false);
        setHighlightedIndex(-1);
        break;
      default:
        break;
    }
  };

  return (
    <div className="relative w-full max-w-md">
      {/* مربع البحث */}
      <div className="flex items-center rounded-xl bg-mainColor/10 p-1">
        <input
          type="text"
          placeholder={t("search.placeholder")}
          value={searchKey}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 150)}
          onChange={(e) => setSearchKey(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 px-2 py-1 border-none outline-none bg-transparent placeholder:text-gray-400 text-sm"
          autoComplete="off"
          aria-expanded={isFocused && filteredCars.length > 0}
          aria-haspopup="listbox"
          aria-activedescendant={
            highlightedIndex >= 0 && filteredCars[highlightedIndex]
              ? `search-result-${filteredCars[highlightedIndex].id}`
              : undefined
          }
        />
        <span className="text-xl text-mainColor p-2 cursor-pointer">
          <IoSearchOutline />
        </span>
      </div>

      {/* قائمة النتائج */}
      {isFocused && filteredCars.length > 0 && (
        <div
          ref={listRef}
          role="listbox"
          className="absolute left-0 right-0 top-full mt-2 bg-white rounded-xl shadow-lg border border-gray-200 max-h-60 overflow-y-auto z-50"
          onMouseDown={(e) => e.preventDefault()}
        >
          {filteredCars.map((car, index) => (
            <div
              key={car.id}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              id={`search-result-${car.id}`}
              role="option"
              aria-selected={highlightedIndex === index}
              onClick={() => selectCar(car)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`p-2 cursor-pointer flex justify-between items-center gap-2 text-xs ${
                highlightedIndex === index
                  ? "bg-mainColor/20 text-mainColor"
                  : "text-gray-700 hover:bg-mainColor/10"
              }`}
            >
              <span className="font-medium">{car.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* في حالة مفيش نتائج */}
      {isFocused && searchKey && filteredCars.length === 0 && (
        <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-xl shadow-lg border border-gray-200 p-3 text-center text-sm text-gray-500 z-50">
          {t("search.noResults")}
        </div>
      )}
    </div>
  );
};

export default Search;
