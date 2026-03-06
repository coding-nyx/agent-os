import { useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { getModulePersona } from '@/lib/persona-registry';
import { MODULE_MANIFEST, ModuleId } from '@/lib/module-manifest';
import { NexusChat } from './NexusChat';

interface NexusSubModulePanelProps {
  moduleId: string;
  initialContent?: string;
  onBack: () => void;
  onNavigate: (path: string) => void;
}

export function NexusSubModulePanel({ moduleId, initialContent, onBack, onNavigate }: NexusSubModulePanelProps) {
  const manifest = MODULE_MANIFEST[moduleId as ModuleId];
  const persona = getModulePersona(moduleId);
  const moduleName = manifest?.alias || moduleId;
  const Icon = manifest?.icon;
  const chatTheme = manifest?.chatTheme || 'indigo';
  const colorHex = manifest?.colorHex || '#8B5CF6';

  const systemPrompt = persona || `You are ${moduleName}, a specialist agent in the Nexus system. Domain: ${manifest?.description || moduleId}. Provide concise domain-expert responses.`;

  const ai = useModuleAI({
    moduleId: `nexus-sub-${moduleId}`,
    systemPrompt,
  });

  const handleNavigateToModule = useCallback(() => {
    if (manifest?.route) {
      onNavigate(manifest.route);
    }
  }, [manifest?.route, onNavigate]);

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
      className="absolute inset-0 flex flex-col bg-black/60 backdrop-blur-xl z-10"
    >
      <div className="p-4 md:p-6 pb-3 flex items-center justify-between border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors group"
            aria-label="Back to Nexus"
          >
            <ArrowLeft className="w-4 h-4 text-white/30 group-hover:text-white transition-colors" />
          </button>
          <div className="flex items-center gap-2.5">
            {Icon && (
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center border"
                style={{ backgroundColor: `${colorHex}15`, borderColor: `${colorHex}30` }}
              >
                <Icon className="w-4 h-4" style={{ color: colorHex }} />
              </div>
            )}
            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-white">{moduleName}</h3>
              <p className="text-[8px] font-bold text-white/25 uppercase tracking-widest">Sub-Module Session</p>
            </div>
          </div>
        </div>

        {manifest?.route && (
          <button
            onClick={handleNavigateToModule}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 transition-colors group text-[9px] font-bold uppercase tracking-widest text-white/40 hover:text-white"
          >
            Open Full Module
            <ExternalLink className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col relative w-full h-full pb-4">
        <NexusChat
          ai={ai}
          agentName={moduleName}
          themeColor={chatTheme}
          placeholder={`Ask ${moduleName}...`}
          showInternalSignals={false}
        />
      </div>
    </motion.div>
  );
}
