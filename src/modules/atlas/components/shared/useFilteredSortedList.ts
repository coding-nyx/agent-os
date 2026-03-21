import { useMemo } from 'react';

export interface FilterSortConfig<T, F, S> {
  items: T[];
  filter: F;
  searchQuery?: string;
  sortBy?: S;
  filterFn?: (item: T, filter: F) => boolean;
  searchFn?: (item: T, query: string) => boolean;
  sortFn?: (a: T, b: T, sortBy: S) => number;
}

export function useFilteredSortedList<T, F, S = string>({
  items,
  filter,
  searchQuery = '',
  sortBy,
  filterFn,
  searchFn,
  sortFn
}: FilterSortConfig<T, F, S>) {
  return useMemo(() => {
    let result = items;

    // Apply status filter
    if (filterFn) {
      result = result.filter(item => filterFn(item, filter));
    }

    // Apply search
    if (searchQuery.trim() && searchFn) {
      const query = searchQuery.toLowerCase();
      result = result.filter(item => searchFn(item, query));
    }

    // Sort
    if (sortFn && sortBy) {
      result = [...result].sort((a, b) => sortFn(a, b, sortBy));
    }

    return result;
  }, [items, filter, searchQuery, sortBy, filterFn, searchFn, sortFn]);
}