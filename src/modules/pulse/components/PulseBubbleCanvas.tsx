import { useEffect, useMemo, useRef } from 'react';
import { InterestNode } from '../services/pulse-profile-service';

const WIDTH = 520;
const HEIGHT = 360;

type Bubble = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  label: string;
  score: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function PulseBubbleCanvas({ interests }: { interests: InterestNode[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bubbles = useMemo<Bubble[]>(() => {
    return interests.slice(0, 14).map((interest, index) => {
      const radius = clamp(14 + interest.score * 0.25, 18, 46);
      return {
        id: interest.id,
        x: 60 + (index % 4) * 120 + Math.random() * 10,
        y: 60 + Math.floor(index / 4) * 90 + Math.random() * 10,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        radius,
        label: interest.topic,
        score: interest.score
      };
    });
  }, [interests]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrame: number;

    const step = () => {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);

      for (let i = 0; i < bubbles.length; i += 1) {
        const bubble = bubbles[i];
        bubble.x += bubble.vx;
        bubble.y += bubble.vy;

        if (bubble.x - bubble.radius < 0 || bubble.x + bubble.radius > WIDTH) {
          bubble.vx *= -1;
        }
        if (bubble.y - bubble.radius < 0 || bubble.y + bubble.radius > HEIGHT) {
          bubble.vy *= -1;
        }
      }

      for (let i = 0; i < bubbles.length; i += 1) {
        for (let j = i + 1; j < bubbles.length; j += 1) {
          const a = bubbles[i];
          const b = bubbles[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = a.radius + b.radius + 8;
          if (dist < minDist) {
            const force = (minDist - dist) * 0.005;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            a.vx -= fx;
            a.vy -= fy;
            b.vx += fx;
            b.vy += fy;
          }
        }
      }

      for (const bubble of bubbles) {
        const gradient = ctx.createRadialGradient(
          bubble.x - bubble.radius * 0.3,
          bubble.y - bubble.radius * 0.3,
          bubble.radius * 0.4,
          bubble.x,
          bubble.y,
          bubble.radius
        );
        gradient.addColorStop(0, 'rgba(217,70,239,0.65)');
        gradient.addColorStop(1, 'rgba(217,70,239,0.15)');

        ctx.beginPath();
        ctx.arc(bubble.x, bubble.y, bubble.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.strokeStyle = 'rgba(217,70,239,0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(bubble.label.slice(0, 10), bubble.x, bubble.y + 4);
      }

      animationFrame = window.requestAnimationFrame(step);
    };

    animationFrame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [bubbles]);

  return (
    <div className="rounded-3xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-4">
      <div className="text-[9px] font-black uppercase tracking-[0.3em] text-fuchsia-300 mb-3">Interest Field</div>
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        className="w-full max-w-full h-auto"
      />
      <p className="mt-3 text-[10px] text-white/45">
        Nodes drift based on momentum score. Higher intensity topics expand and repel weaker nodes.
      </p>
    </div>
  );
}
