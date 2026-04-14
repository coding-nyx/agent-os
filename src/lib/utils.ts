import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

export function formatNumber(value: number, minimumFractionDigits: number = 0, maximumFractionDigits: number = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits,
    maximumFractionDigits
  }).format(value);
}

/**
 * Returns a throttled version of `fn` that fires at most once every `ms`
 * milliseconds.  Uses a trailing-edge strategy: the last invocation during a
 * throttled window is always delivered once the window expires.
 */
export function throttle<T extends (...args: unknown[]) => void>(fn: T, ms: number): T & { cancel(): void } {
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  const throttled = ((...args: Parameters<T>) => {
    lastArgs = args;
    if (timerId !== null) return;
    fn(...args);
    lastArgs = null;
    timerId = setTimeout(() => {
      timerId = null;
      if (lastArgs) {
        fn(...lastArgs);
        lastArgs = null;
      }
    }, ms);
  }) as T & { cancel(): void };

  throttled.cancel = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    lastArgs = null;
  };

  return throttled;
}

