/**
 * Collapsible AI Panel - Health insights and recommendations
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, AlertCircle, Info, CheckCircle, X } from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { cn } from '@/lib/utils';

interface AIInsight {
  type: 'info' | 'warning' | 'success';
  message: string;
}

interface CollapsibleAIPanelProps {
  insights: AIInsight[];
  onClose?: () => void;
}

export function CollapsibleAIPanel({ insights, onClose }: CollapsibleAIPanelProps) {
  const getIcon = (type: AIInsight['type']) => {
    switch (type) {
      case 'success':
        return CheckCircle;
      case 'warning':
        return AlertCircle;
      case 'info':
      default:
        return Info;
    }
  };

  const getColorClasses = (type: AIInsight['type']) => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-[var(--module-accent-muted)]',
          border: 'border-[var(--module-accent-border)]',
          text: 'text-[var(--module-color-400)]',
          icon: 'text-[var(--module-color-400)]',
        };
      case 'warning':
        return {
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/30',
          text: 'text-amber-400',
          icon: 'text-amber-400',
        };
      case 'info':
      default:
        return {
          bg: 'bg-cyan-500/10',
          border: 'border-cyan-500/30',
          text: 'text-cyan-400',
          icon: 'text-cyan-400',
        };
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="overflow-hidden"
      >
        <SurfaceCard className="p-6 relative">
          {/* Close button */}
          {onClose && (
            <NeuralButton
              variant="ghost"
              onClick={onClose}
              className="absolute top-4 right-4 p-1 rounded-lg hover:bg-white/5 transition-colors"
              aria-label="Close AI panel"
            >
              <X className="w-4 h-4 text-white/40 hover:text-white/60" />
            </NeuralButton>
          )}

          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-500/20 to-purple-500/20">
              <Brain className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">AI Health Insights</h3>
              <p className="text-xs text-white/40">Personalized recommendations based on your data</p>
            </div>
          </div>

          {/* Insights */}
          {insights.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-white/40 italic">
                No insights available. Keep tracking your metrics!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {insights.map((insight, index) => {
                const Icon = getIcon(insight.type);
                const colors = getColorClasses(insight.type);

                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={cn(
                      'flex items-start gap-3 p-4 rounded-lg border',
                      colors.bg,
                      colors.border
                    )}
                  >
                    <Icon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', colors.icon)} />
                    <p className={cn('text-sm flex-1', colors.text)}>
                      {insight.message}
                    </p>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Footer note */}
          <div className="mt-6 pt-4 border-t border-white/5">
            <p className="text-xs text-white/30 italic">
              💡 These insights are generated from your biometric data and are for informational purposes only.
              Consult a healthcare professional for medical advice.
            </p>
          </div>
        </SurfaceCard>
      </motion.div>
    </AnimatePresence>
  );
}
