import { useState, useEffect, useCallback } from "react";

type FilterValue = string | string[] | Date | undefined;

interface FilterConfig {
  key: string;
  defaultValue: FilterValue;
  type?: "string" | "stringArray" | "date";
}

/**
 * Hook to persist filter values in localStorage
 * @param pageKey - Unique key for the page (e.g., "asientos", "terceros")
 * @param filters - Array of filter configurations
 */
export function usePersistedFilters<T extends Record<string, FilterValue>>(
  pageKey: string,
  filters: FilterConfig[]
): [T, (key: keyof T, value: FilterValue) => void, () => void] {
  // Initialize state from localStorage
  const [filterValues, setFilterValues] = useState<T>(() => {
    const initialValues: Record<string, FilterValue> = {};
    
    filters.forEach(({ key, defaultValue, type = "string" }) => {
      const storageKey = `${pageKey}_filter_${key}`;
      const saved = localStorage.getItem(storageKey);
      
      if (saved === null) {
        initialValues[key] = defaultValue;
      } else {
        try {
          switch (type) {
            case "date":
              initialValues[key] = saved ? new Date(saved) : undefined;
              break;
            case "stringArray":
              initialValues[key] = JSON.parse(saved) as string[];
              break;
            default:
              initialValues[key] = saved;
          }
        } catch {
          initialValues[key] = defaultValue;
        }
      }
    });
    
    return initialValues as T;
  });

  // Update a single filter value
  const setFilter = useCallback((key: keyof T, value: FilterValue) => {
    setFilterValues(prev => ({ ...prev, [key]: value }));
    
    const storageKey = `${pageKey}_filter_${String(key)}`;
    const filterConfig = filters.find(f => f.key === String(key));
    
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
      localStorage.removeItem(storageKey);
    } else if (value instanceof Date) {
      localStorage.setItem(storageKey, value.toISOString());
    } else if (Array.isArray(value)) {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } else {
      localStorage.setItem(storageKey, value);
    }
  }, [pageKey, filters]);

  // Clear all filters for this page
  const clearFilters = useCallback(() => {
    const clearedValues: Record<string, FilterValue> = {};
    
    filters.forEach(({ key, defaultValue }) => {
      const storageKey = `${pageKey}_filter_${key}`;
      localStorage.removeItem(storageKey);
      clearedValues[key] = defaultValue;
    });
    
    setFilterValues(clearedValues as T);
  }, [pageKey, filters]);

  return [filterValues, setFilter, clearFilters];
}

// Simple hook for a single filter value
export function usePersistedFilter<T extends string>(
  pageKey: string,
  filterKey: string,
  defaultValue: T
): [T, (value: T) => void] {
  const storageKey = `${pageKey}_filter_${filterKey}`;
  
  const [value, setValue] = useState<T>(() => {
    const saved = localStorage.getItem(storageKey);
    return (saved as T) || defaultValue;
  });

  const setPersistedValue = useCallback((newValue: T) => {
    setValue(newValue);
    if (newValue === defaultValue || newValue === "" || newValue === "all") {
      localStorage.removeItem(storageKey);
    } else {
      localStorage.setItem(storageKey, newValue);
    }
  }, [storageKey, defaultValue]);

  return [value, setPersistedValue];
}

// Hook for persisted date filter
export function usePersistedDateFilter(
  pageKey: string,
  filterKey: string
): [Date | undefined, (value: Date | undefined) => void] {
  const storageKey = `${pageKey}_filter_${filterKey}`;
  
  const [value, setValue] = useState<Date | undefined>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? new Date(saved) : undefined;
  });

  const setPersistedValue = useCallback((newValue: Date | undefined) => {
    setValue(newValue);
    if (newValue) {
      localStorage.setItem(storageKey, newValue.toISOString());
    } else {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  return [value, setPersistedValue];
}

// Hook for persisted string array filter (multi-select)
export function usePersistedArrayFilter(
  pageKey: string,
  filterKey: string
): [string[], (value: string[]) => void] {
  const storageKey = `${pageKey}_filter_${filterKey}`;
  
  const [value, setValue] = useState<string[]>(() => {
    const saved = localStorage.getItem(storageKey);
    try {
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const setPersistedValue = useCallback((newValue: string[]) => {
    setValue(newValue);
    if (newValue.length === 0) {
      localStorage.removeItem(storageKey);
    } else {
      localStorage.setItem(storageKey, JSON.stringify(newValue));
    }
  }, [storageKey]);

  return [value, setPersistedValue];
}
