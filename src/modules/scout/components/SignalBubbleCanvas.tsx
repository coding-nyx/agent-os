import React, { useMemo } from 'react';
import { InterestNode } from '../services/scout-knowledge-service';

export function SignalBubbleCanvas({ interests }: { interests: InterestNode[] }) {
  const bubbles = useMemo(() => {
    return interests.map((item) => {
      const size = 60 + (item.score / 100) * 80;
      // Fixed deterministic layout based on score/topic
      const left = 10 + (item.score % 70) + (item.topic.length % 10);
      const top = 10 + (item.topic.length * 7) % 60;
      
      return {
        ...item,
        size,
        left: `${left}%`,
        top: `${top}%`,
      };
    });
  }, [interests]);

  if (interests.length === 0) return null;

  return (
    <div className="relative w-full h-[300px] overflow-hidden rounded-3xl bg-slate-900/50 border border-white/[0.09]">
      <div className="absolute inset-0 signal-grid opacity-20" />
      
      {bubbles.map((bubble) => (
        <div
          key={bubble.id}
          className="absolute flex items-center justify-center rounded-full backdrop-blur-md border animate-float group transition-transform hover:scale-110"
          style={{
            width: bubble.size,
            height: bubble.size,
            left: bubble.left,
            top: bubble.top,
            backgroundColor: bubble.trend === 'rising' ? 'rgba(244, 63, 94, 0.1)' : bubble.trend === 'cooling' ? 'rgba(14, 165, 233, 0.1)' : 'rgba(139, 92, 246, 0.1)',
            borderColor: bubble.trend === 'rising' ? 'rgba(244, 63, 94, 0.3)' : bubble.trend === 'cooling' ? 'rgba(14, 165, 233, 0.3)' : 'rgba(139, 92, 246, 0.3)',
            animationDelay: `${Math.random() * 5}s`,
            zIndex: Math.round(bubble.score)
          }}
        >
          <div className="text-center p-2">
            <div className="text-[11px] font-black uppercase tracking-widest text-white/90 truncate max-w-[80px]">
              {bubble.topic}
            </div>
            <div className="text-[11px] font-bold text-white/40 mt-0.5">
              {bubble.score}%
            </div>
          </div>
          
          {/* Orbital ring for rising topics */}
          {bubble.trend === 'rising' && (
            <div className="absolute inset-[-4px] rounded-full border border-rose-500/20 animate-ping" />
          )}
        </div>
      ))}
    </div>
  );
}
