import { useState, useMemo } from "react";

export type PageSize = 50 | 100 | 200 | "all";

const PAGE_SIZE_OPTIONS: { value: PageSize; label: string }[] = [
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 200, label: "200" },
  { value: "all", label: "Todo" },
];

export function useTablePagination<T>(items: T[], defaultPageSize: PageSize = 50) {
  const storageKey = "table_page_size";
  const [pageSize, setPageSize] = useState<PageSize>(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved === "all") return "all";
    const num = Number(saved);
    if (num === 50 || num === 100 || num === 200) return num;
    return defaultPageSize;
  });
  const [currentPage, setCurrentPage] = useState(1);

  const totalItems = items.length;
  const effectivePageSize = pageSize === "all" ? totalItems : pageSize;
  const totalPages = effectivePageSize > 0 ? Math.max(1, Math.ceil(totalItems / effectivePageSize)) : 1;

  // Reset to page 1 if current page exceeds total
  const safePage = Math.min(currentPage, totalPages);

  const paginatedItems = useMemo(() => {
    if (pageSize === "all") return items;
    const start = (safePage - 1) * effectivePageSize;
    return items.slice(start, start + effectivePageSize);
  }, [items, safePage, effectivePageSize, pageSize]);

  const handlePageSizeChange = (newSize: PageSize) => {
    setPageSize(newSize);
    setCurrentPage(1);
    localStorage.setItem(storageKey, String(newSize));
  };

  const from = totalItems === 0 ? 0 : (safePage - 1) * effectivePageSize + 1;
  const to = Math.min(safePage * effectivePageSize, totalItems);

  return {
    paginatedItems,
    currentPage: safePage,
    setCurrentPage,
    pageSize,
    setPageSize: handlePageSizeChange,
    totalPages,
    totalItems,
    from,
    to,
    PAGE_SIZE_OPTIONS,
  };
}
