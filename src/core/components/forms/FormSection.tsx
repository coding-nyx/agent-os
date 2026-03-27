/**
 * Form Section Component
 * Groups related fields with collapsible sections and Neural styling
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface FormSectionProps {
  /** Section title */
  title: string;
  /** Section description */
  description?: string;
  /** Child form fields */
  children: React.ReactNode;
  /** Whether section is collapsible */
  collapsible?: boolean;
  /** Initial collapsed state */
  defaultCollapsed?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function FormSection({
  title,
  description,
  children,
  collapsible = false,
  defaultCollapsed = false,
  className,
}: FormSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const toggleCollapse = () => {
    if (collapsible) {
      setIsCollapsed(!isCollapsed);
    }
  };

  return (
    <div
      className={cn(
        'relative bg-white/[0.045] backdrop-blur-sm border border-white/[0.09] rounded-3xl overflow-hidden',
        className
      )}
    >
      {/* Section Header */}
      <div
        className={cn(
          'px-6 py-4 border-b border-white/[0.09]',
          collapsible && 'cursor-pointer hover:bg-white/[0.045] transition-colors'
        )}
        onClick={toggleCollapse}
        role={collapsible ? 'button' : undefined}
        aria-expanded={collapsible ? !isCollapsed : undefined}
        aria-controls={collapsible ? `section-${title}` : undefined}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h3
              className={cn(
                'text-sm font-bold uppercase tracking-wider',
                'bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent'
              )}
            >
              {title}
            </h3>
            {description && (
              <p className="text-xs text-white/40 mt-1 italic">{description}</p>
            )}
          </div>

          {collapsible && (
            <motion.div
              animate={{ rotate: isCollapsed ? -90 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="w-5 h-5 text-white/40" />
            </motion.div>
          )}
        </div>
      </div>

      {/* Section Content */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            id={collapsible ? `section-${title}` : undefined}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <div className="p-6 space-y-6">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Neural accent border */}
      <div
        className="absolute inset-0 pointer-events-none rounded-3xl"
        style={{
          background:
            'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, transparent 50%)',
        }}
      />
    </div>
  );
}
