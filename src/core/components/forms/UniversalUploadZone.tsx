import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Camera, FileText, Image as ImageIcon, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NeuralButton } from '../NeuralButton';

export type UploadPhase = 'idle' | 'drag_over' | 'uploading' | 'processing' | 'complete' | 'error';

export interface UniversalUploadZoneProps {
  onFileSelected: (file: File) => void;
  onCameraCapture?: (dataUrl: string) => void;
  acceptedTypes?: string;
  maxSizeMb?: number;
  phase?: UploadPhase;
  progress?: number;
  error?: string | null;
  label?: string;
  description?: string;
  compact?: boolean;
  themeColor?: 'indigo' | 'orange' | 'emerald' | 'cyan' | 'violet' | 'lime';
  disabled?: boolean;
}

export function UniversalUploadZone({
  onFileSelected,
  onCameraCapture,
  acceptedTypes = '.pdf,.png,.jpg,.jpeg,.webp,.txt',
  maxSizeMb = 10,
  phase: externalPhase,
  progress = 0,
  error = null,
  label = 'Upload Document',
  description = 'Drag and drop or select a file',
  compact = false,
  themeColor = 'indigo',
  disabled = false
}: UniversalUploadZoneProps) {
  const [internalPhase, setInternalPhase] = useState<UploadPhase>('idle');
  const phase = externalPhase ?? internalPhase;
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (disabled || phase === 'uploading' || phase === 'processing') return;
    setInternalPhase('drag_over');
  }, [disabled, phase]);

  const handleDragLeave = useCallback(() => {
    setInternalPhase('idle');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setInternalPhase('idle');
    if (disabled || phase === 'uploading' || phase === 'processing') return;

    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [disabled, phase]);

  const handleFile = (file: File) => {
    if (file.size > maxSizeMb * 1024 * 1024) {
      alert(`File too large. Max size is ${maxSizeMb}MB.`);
      return;
    }
    onFileSelected(file);
  };

  const themeClasses = {
    indigo: 'text-indigo-400 border-indigo-500/20 bg-indigo-500/5',
    orange: 'text-orange-400 border-orange-500/20 bg-orange-500/5',
    emerald: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5',
    cyan: 'text-cyan-400 border-cyan-500/20 bg-cyan-500/5',
    violet: 'text-violet-400 border-violet-500/20 bg-violet-500/5',
    lime: 'text-lime-400 border-lime-500/20 bg-lime-500/5',
  };

  const activeColorClass = themeClasses[themeColor];

  return (
    <div className={cn("relative w-full", compact ? "max-w-sm" : "max-w-2xl mx-auto")}>
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept={acceptedTypes}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      <motion.div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={cn(
          "relative group cursor-pointer rounded-[2rem] border-2 border-dashed transition-all duration-500 overflow-hidden",
          phase === 'drag_over' ? cn("scale-[1.02] border-solid shadow-2xl", activeColorClass) : "border-white/10 hover:border-white/20 bg-white/[0.02]",
          disabled && "opacity-50 cursor-not-allowed",
          compact ? "p-6" : "p-12"
        )}
      >
        <div className="flex flex-col items-center text-center space-y-4">
          <div className={cn(
            "w-16 h-16 rounded-2xl flex items-center justify-center transition-transform duration-500 group-hover:scale-110",
            phase === 'drag_over' ? "bg-white/10" : "bg-white/[0.03]"
          )}>
            {phase === 'error' ? (
              <AlertCircle className="w-8 h-8 text-rose-400" />
            ) : phase === 'complete' ? (
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            ) : (
              <Upload className={cn("w-8 h-8", phase === 'drag_over' ? activeColorClass.split(' ')[0] : "text-white/20")} />
            )}
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-black tracking-tight uppercase italic text-white">{label}</h3>
            <p className="text-xs text-white/40 font-medium uppercase tracking-widest">{description}</p>
          </div>

          {onCameraCapture && !compact && (
            <div className="pt-4 flex gap-3">
              <NeuralButton
                variant="ghost"
                size="sm"
                themeColor={themeColor}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCameraActive(true);
                }}
                className="rounded-full px-6"
              >
                <Camera className="w-4 h-4 mr-2" />
                Use Camera
              </NeuralButton>
            </div>
          )}
        </div>

        {/* Progress Overlay */}
        <AnimatePresence>
          {(phase === 'uploading' || phase === 'processing') && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-8"
            >
              <div className="w-full max-w-xs space-y-4">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-white">
                      {phase === 'uploading' ? 'Uploading' : 'Analysing'}
                    </p>
                    <p className="text-[10px] text-white/40 uppercase tracking-widest">
                      {phase === 'uploading' ? 'Securing transfer' : 'Extracting neural context'}
                    </p>
                  </div>
                  <span className="text-xl font-black text-white tabular-nums">{Math.round(progress)}%</span>
                </div>
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    className={cn("h-full rounded-full", activeColorClass.split(' ')[2])}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {error && (
        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 text-center text-[10px] font-black uppercase tracking-widest text-rose-400"
        >
          {error}
        </motion.p>
      )}
    </div>
  );
}
