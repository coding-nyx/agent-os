/**
 * Form Field Wrapper Component
 * Provides consistent layout for all form fields with labels, descriptions, and errors
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface FormFieldWrapperProps {
  /** Unique field ID */
  fieldId: string;
  /** Field label */
  label: string;
  /** Optional description/help text */
  description?: string;
  /** Whether field is required */
  required?: boolean;
  /** Validation error message */
  error?: string;
  /** Child input component */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Whether field is disabled */
  disabled?: boolean;
}

export function FormFieldWrapper({
  fieldId,
  label,
  description,
  required = false,
  error,
  children,
  className,
  disabled = false,
}: FormFieldWrapperProps) {
  const hasError = Boolean(error);

  return (
    <div className={cn('space-y-2 w-full', className)}>
      {/* Label with required indicator */}
      <label
        htmlFor={fieldId}
        className={cn(
          'block text-[11px] font-black uppercase tracking-[0.2em] ml-4 italic transition-colors',
          hasError
            ? 'text-red-400/80'
            : disabled
            ? 'text-white/20'
            : 'text-white/40'
        )}
      >
        {label}
        {required && (
          <span className="ml-1 text-indigo-400" aria-label="required">
            *
          </span>
        )}
      </label>

      {/* Description tooltip */}
      {description && !hasError && (
        <div className="flex items-start gap-2 ml-4 mb-1">
          <Info className="w-3 h-3 text-white/30 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-white/40 italic">{description}</p>
        </div>
      )}

      {/* Input field */}
      <div className="relative">{children}</div>

      {/* Error message with animation */}
      <AnimatePresence mode="wait">
        {hasError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="flex items-start gap-2 ml-4"
            role="alert"
            aria-live="polite"
          >
            <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-400 font-medium">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
