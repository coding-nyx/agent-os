import { useEffect, useState } from 'react';
import { differenceInHours, differenceInMinutes, differenceInSeconds } from 'date-fns';

interface CountdownTimerProps {
  targetDate: string; // ISO string or parsable date
}

export function CountdownTimer({ targetDate }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<{ label: string, urgent: boolean } | null>(null);

  useEffect(() => {
    const calculateTime = () => {
      const now = new Date();
      const target = new Date(targetDate);
      const diffHours = differenceInHours(target, now);

      if (diffHours < 0) {
        // Class passed
        setTimeLeft(null);
        return;
      }

      if (diffHours >= 24) {
        const days = Math.ceil(diffHours / 24);
        setTimeLeft({ label: `${days} Days Left`, urgent: false });
      } else {
        // Under 24 hours, show timer
        const h = Math.floor((target.getTime() - now.getTime()) / (1000 * 60 * 60));
        const m = Math.floor(((target.getTime() - now.getTime()) % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor(((target.getTime() - now.getTime()) % (1000 * 60)) / 1000);

        const pad = (n: number) => n.toString().padStart(2, '0');
        setTimeLeft({
            label: `${pad(h)}:${pad(m)}:${pad(s)}`,
            urgent: true
        });
      }
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  if (!timeLeft) return null;

  return (
    <div className={`text-sm font-bold ${timeLeft.urgent ? 'text-destructive animate-pulse' : 'text-primary'}`}>
      {timeLeft.urgent ? 'Starting in: ' : ''}{timeLeft.label}
    </div>
  );
}
