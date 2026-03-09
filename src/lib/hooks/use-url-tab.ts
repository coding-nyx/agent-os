/**
 * useUrlTab - Persists tab state to URL query params
 * Survives component re-renders when profile updates from Firestore
 * 
 * Usage:
 * const { activeTab, setActiveTab } = useUrlTab(['tab1', 'tab2', 'tab3'], 'tab1');
 */

import { useSearchParams } from 'react-router-dom';
import { useCallback } from 'react';

export function useUrlTab<T extends string>(validTabs: readonly T[], defaultTab: T) {
  const [searchParams, setSearchParams] = useSearchParams();
  
  const activeTab = (searchParams.get('tab') as T) || defaultTab;
  
  const setActiveTab = useCallback((newTab: T | ((prev: T) => T)) => {
    const tab = typeof newTab === 'function' ? newTab(activeTab) : newTab;
    if (validTabs.includes(tab)) {
      setSearchParams(prev => {
        prev.set('tab', tab);
        return prev;
      });
    }
  }, [activeTab, validTabs, setSearchParams]);

  return { activeTab, setActiveTab };
}
