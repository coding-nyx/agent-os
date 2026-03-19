import React from 'react';
import { motion } from 'framer-motion';
import { Handshake, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Metric {
    label: string;
    value?: number | string | null;
    max?: number;
    icon: React.ComponentType<{ className?: string }>;
    colorClass: string;
    metricKey?: string;
    lastUpdated?: string;
    isDerived?: boolean;
    isEmpty?: boolean;
    isLoading?: boolean;
}

interface VitalsGridProps {
    metrics: Metric[];
    columns?: number;
    isLocked?: boolean;
    onCalibrate?: (metricKey: string) => void;
}

export function VitalsGrid({ metrics, columns = 4, isLocked = false, onCalibrate }: VitalsGridProps) {
    const gridCols = {
        1: 'grid-cols-1',
        2: 'grid-cols-2',
        3: 'grid-cols-1 md:grid-cols-3',
        4: 'grid-cols-2'
    }[columns as 1 | 2 | 3 | 4] || 'grid-cols-2';

    return (
        <div className={cn("grid gap-4", gridCols)}>
            {metrics.map((metric, i) => {
                const Icon = isLocked ? Lock : metric.icon;
                const labelText = isLocked ? 'SECURED' : metric.label;
                const isMissing = metric.value === null || metric.value === undefined;
                const isBusy = metric.isEmpty || metric.isLoading;
                const numericValue = typeof metric.value === 'number' ? metric.value : null;
                const numericMax = typeof metric.max === 'number' ? metric.max : null;
                const showValue = !isLocked && !isBusy && !isMissing;
                const showCalibrate = !isLocked && !isBusy && isMissing;
                const showProgress = showValue && numericValue !== null && numericMax !== null;
                const progressWidth =
                  showProgress && numericValue !== null && numericMax !== null
                    ? (numericValue / numericMax) * 100
                    : 0;
                const ghosted = Boolean(metric.isDerived);

                return (
                    <motion.div 
                        key={metric.label}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="p-3 sm:p-4 border border-white/5 rounded-2xl bg-white/[0.02] space-y-2 sm:space-y-3 flex flex-col justify-between"
                    >
                        <div className="flex items-center justify-between">
                            <Icon className={cn("w-4 h-4", isLocked ? "text-amber-300/60" : metric.colorClass)} />
                            <span className="text-[8px] font-black text-white/40 uppercase tracking-[0.2em]">
                              {labelText}
                            </span>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-end justify-between">
                                {isLocked ? (
                                    <span className="text-xs font-black tracking-widest text-amber-300/70 inline-flex items-center gap-2">
                                      <Lock className="w-3 h-3" />
                                      ***
                                    </span>
                                ) : isBusy ? (
                                    <div className="h-6 w-20 rounded-md skeleton" />
                                ) : showCalibrate ? (
                                    <button
                                        onClick={() => metric.metricKey && onCalibrate?.(metric.metricKey)}
                                        className="px-3 py-1 rounded-full border border-white/10 bg-white/5 text-[10px] font-black uppercase tracking-[0.2em] text-white/60 hover:text-white/90 transition inline-flex items-center gap-2 animate-pulse"
                                    >
                                        <Handshake className="w-3 h-3" />
                                        Calibrate
                                    </button>
                                ) : (
                                    <span
                                      className={cn(
                                        "text-xl font-bold tabular-nums font-display",
                                        ghosted ? "text-white/50 blur-[0.3px]" : ""
                                      )}
                                    >
                                        {metric.value}
                                        {metric.max && <span className="text-[10px] text-white/40 ml-1">/{metric.max}</span>}
                                    </span>
                                )}
                            </div>
                            {isLocked ? (
                                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full w-1/3 rounded-full bg-white/10" />
                                </div>
                            ) : showProgress ? (
                                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                    <motion.div 
                                        initial={{ width: 0 }}
                                    animate={{ width: `${progressWidth}%` }}
                                    className={cn("h-full", metric.colorClass.replace('text-', 'bg-'), ghosted ? "opacity-50" : "")}
                                    />
                                </div>
                            ) : (
                                <div className="h-1 w-full rounded-full bg-white/5 overflow-hidden">
                                    <div className="h-full w-1/3 rounded-full skeleton" />
                                </div>
                            )}
                        </div>
                    </motion.div>
                );
            })}
        </div>
    );
}
