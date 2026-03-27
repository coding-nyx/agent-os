import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Shield, Settings, DatabaseZap } from 'lucide-react';
import { ModuleLayout } from '@/core/layout/ModuleLayout';
import { NeuralTabGroup, NeuralTabItem } from '@/core/components/NeuralTabGroup';
import { IdentityPanel } from './components/IdentityPanel';
import { SecurityPanel } from './components/SecurityPanel';
import { SystemPanel } from './components/SystemPanel';
import { DataBackupPanel } from './components/DataBackupPanel';

type TabId = 'identity' | 'security' | 'system' | 'data';

const TABS: NeuralTabItem<TabId>[] = [
  { id: 'identity', label: 'Identity', icon: User },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'system', label: 'System', icon: Settings },
  { id: 'data', label: 'Data & Backup', icon: DatabaseZap },
];

const tabVariants = {
  enter: { opacity: 0, y: 12 },
  center: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState<TabId>('identity');

  return (
    <ModuleLayout title="Profile" themeColor="violet">
      <div className="h-full flex flex-col overflow-hidden">
        {/* Tab bar */}
        <div className="shrink-0 px-4 md:px-8 pt-4 pb-2 border-b border-white/[0.09]">
          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
            <div className="hidden md:block">
              <p className="text-[11px] uppercase tracking-[0.25em] text-violet-400/70 font-black mb-0.5">
                Identity Surface
              </p>
              <h2 className="text-lg font-black italic uppercase tracking-tight text-white leading-none">
                Profile
              </h2>
            </div>
            <div className="w-full md:w-auto md:ml-auto">
              <NeuralTabGroup<TabId>
                tabs={TABS}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                themeColor="purple"
                layoutIdPrefix="profile-tab"
              />
            </div>
          </div>
        </div>

        {/* Panel content */}
        <div className="flex-1 overflow-y-auto no-scrollbar">
          <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-8">
            <AnimatePresence mode="wait">
              {activeTab === 'identity' && (
                <motion.div
                  key="identity"
                  role="tabpanel"
                  id="tab-panel-identity"
                  aria-labelledby="tab-identity"
                  variants={tabVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                >
                  <IdentityPanel />
                </motion.div>
              )}
              {activeTab === 'security' && (
                <motion.div
                  key="security"
                  role="tabpanel"
                  id="tab-panel-security"
                  aria-labelledby="tab-security"
                  variants={tabVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                >
                  <SecurityPanel />
                </motion.div>
              )}
              {activeTab === 'system' && (
                <motion.div
                  key="system"
                  role="tabpanel"
                  id="tab-panel-system"
                  aria-labelledby="tab-system"
                  variants={tabVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                >
                  <SystemPanel />
                </motion.div>
              )}
              {activeTab === 'data' && (
                <motion.div
                  key="data"
                  role="tabpanel"
                  id="tab-panel-data"
                  aria-labelledby="tab-data"
                  variants={tabVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                >
                  <DataBackupPanel />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </ModuleLayout>
  );
}
