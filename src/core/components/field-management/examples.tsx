/**
 * Example: Integrating Field Management into Module Settings
 * 
 * This example shows how to add the Field Management UI to any module's settings page.
 */

import React, { useState } from 'react';
import { Settings, Sliders, Grid3x3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FieldManagementPanel } from '@/core/components/field-management';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { motion } from 'framer-motion';

type SettingsTab = 'profile' | 'fields' | 'preferences';

interface ModuleSettingsPageProps {
  moduleId: string;
  moduleName: string;
}

/**
 * Example settings page with tabs including field management
 */
export function ModuleSettingsPage({ moduleId, moduleName }: ModuleSettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const reducedMotion = useReducedMotion();

  const tabs: {
    key: SettingsTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { key: 'profile', label: 'Profile', icon: Settings },
    { key: 'fields', label: 'Custom Fields', icon: Grid3x3 },
    { key: 'preferences', label: 'Preferences', icon: Sliders },
  ];

  const handleKeyDown = (e: React.KeyboardEvent, currentKey: SettingsTab) => {
    const currentIndex = tabs.findIndex((t) => t.key === currentKey);
    let nextIndex = -1;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    }

    if (nextIndex >= 0) {
      setActiveTab(tabs[nextIndex].key);
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-black italic tracking-wider text-white uppercase">
          {moduleName} Settings
        </h1>
        <p className="text-white/40 text-xs uppercase font-bold tracking-wider mt-1">
          Configure module settings and custom fields
        </p>
      </div>

      {/* Tab Navigation */}
      <nav
        role="tablist"
        aria-label="Settings tabs"
        className="inline-flex items-center gap-1 rounded-2xl bg-white/[0.045] backdrop-blur-sm border border-white/10 p-1"
      >
        {tabs.map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key;

          return (
            <button
              key={key}
              role="tab"
              id={`settings-tab-${key}`}
              aria-selected={isActive}
              aria-controls={`settings-panel-${key}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(key)}
              onKeyDown={(e) => handleKeyDown(e, key)}
              className={cn(
                'relative flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50',
                isActive ? 'text-white' : 'text-white/40 hover:text-white/60'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>

              {/* Active background pill */}
              {isActive && (
                <motion.div
                  layoutId="settings-tab-pill"
                  className="absolute inset-0 rounded-xl bg-indigo-500/10 border border-indigo-500/20"
                  transition={
                    reducedMotion
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 500, damping: 35 }
                  }
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Tab Panels */}
      <div className="mt-6">
        {/* Profile Tab */}
        <div
          role="tabpanel"
          id="settings-panel-profile"
          aria-labelledby="settings-tab-profile"
          hidden={activeTab !== 'profile'}
        >
          {activeTab === 'profile' && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-6">
              <h2 className="text-lg font-bold text-white mb-4">Profile Settings</h2>
              <p className="text-white/60 text-sm">
                Configure your {moduleName} profile...
              </p>
              {/* Add profile settings form here */}
            </div>
          )}
        </div>

        {/* Custom Fields Tab */}
        <div
          role="tabpanel"
          id="settings-panel-fields"
          aria-labelledby="settings-tab-fields"
          hidden={activeTab !== 'fields'}
        >
          {activeTab === 'fields' && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-6">
              <FieldManagementPanel moduleId={moduleId} />
            </div>
          )}
        </div>

        {/* Preferences Tab */}
        <div
          role="tabpanel"
          id="settings-panel-preferences"
          aria-labelledby="settings-tab-preferences"
          hidden={activeTab !== 'preferences'}
        >
          {activeTab === 'preferences' && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-6">
              <h2 className="text-lg font-bold text-white mb-4">Preferences</h2>
              <p className="text-white/60 text-sm">
                Configure your {moduleName} preferences...
              </p>
              {/* Add preferences form here */}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Example: Direct use of Field Management Panel (no tabs)
 */
export function SimpleFieldManagement({ moduleId }: { moduleId: string }) {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <FieldManagementPanel moduleId={moduleId} />
    </div>
  );
}

/**
 * Example: Field Management in a modal/overlay
 */
export function FieldManagementModal({
  isOpen,
  onClose,
  moduleId,
}: {
  isOpen: boolean;
  onClose: () => void;
  moduleId: string;
}) {
  return (
    <div
      className={cn(
        'fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4',
        !isOpen && 'hidden'
      )}
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#05050a] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black italic tracking-wider text-white uppercase">
            Manage Custom Fields
          </h2>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors"
          >
            <span className="sr-only">Close</span>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <FieldManagementPanel moduleId={moduleId} />
      </div>
    </div>
  );
}

/**
 * Usage examples in different modules:
 * 
 * // In TherapyModule settings:
 * <ModuleSettingsPage moduleId="therapy" moduleName="Therapy" />
 * 
 * // In SomaModule settings:
 * <ModuleSettingsPage moduleId="soma" moduleName="Soma" />
 * 
 * // In AtlasModule settings:
 * <ModuleSettingsPage moduleId="atlas" moduleName="Atlas" />
 * 
 * // Simple inline usage:
 * <SimpleFieldManagement moduleId="ledger" />
 * 
 * // In a modal:
 * const [showFieldModal, setShowFieldModal] = useState(false);
 * <FieldManagementModal 
 *   isOpen={showFieldModal}
 *   onClose={() => setShowFieldModal(false)}
 *   moduleId="trainer"
 * />
 */
