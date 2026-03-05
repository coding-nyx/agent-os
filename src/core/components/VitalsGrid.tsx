import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Metric {
    label: string;
    value: number | string;
    max?: number;
    icon: any;
    colorClass: string;
}

interface VitalsGridProps {
    metrics: Metric[];
    columns?: number;
}

export function VitalsGrid({ metrics, columns = 4 }: VitalsGridProps) {
    const gridCols = {
        1: 'grid-cols-1',
        2: 'grid-cols-2',
        3: 'grid-cols-1 md:grid-cols-3',
        4: 'grid-cols-2 lg:grid-cols-4'
    }[columns as 1 | 2 | 3 | 4] || 'grid-cols-2 lg:grid-cols-4';

    return (
        <div className={cn("grid gap-4", gridCols)}>
            {metrics.map((metric, i) => (
                <motion.div 
                    key={metric.label}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="p-4 border border-white/5 rounded-2xl bg-white/[0.02] space-y-3"
                >
                    <div className="flex items-center justify-between">
                        <metric.icon className={cn("w-4 h-4", metric.colorClass)} />
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em]">{metric.label}</span>
                    </div>
                    <div className="space-y-1">
                        <div className="flex items-end justify-between">
                            <span className="text-xl font-black italic tabular-nums">
                                {metric.value}
                                {metric.max && <span className="text-[10px] text-white/20 not-italic ml-1">/{metric.max}</span>}
                            </span>
                        </div>
                        {metric.max && typeof metric.value === 'number' && (
                            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${(metric.value / metric.max) * 100}%` }}
                                    className={cn("h-full", metric.colorClass.replace('text-', 'bg-'))}
                                />
                            </div>
                        )}
                    </div>
                </motion.div>
            ))}
        </div>
    );
}
