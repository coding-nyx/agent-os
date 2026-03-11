import { useState, useEffect } from 'react';

export type ConnectivityStatus = 'connected' | 'obstructed' | 'checking';

export function useConnectivitySentinel() {
  const [status, setStatus] = useState<ConnectivityStatus>('checking');
  const [isFirebaseBlocked, setIsFirebaseBlocked] = useState(false);
  const [isLLMBlocked, setIsLLMBlocked] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkConnectivity = async () => {
      const results = await Promise.allSettled([
        // Check Firestore connectivity via a lightweight DNS-resolvable endpoint
        // (not the Write/channel WebSocket endpoint which always returns 400 to HEAD)
        fetch('https://firestore.googleapis.com/', {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-store'
        }).catch(() => { throw new Error('blocked'); }),

        // Check OpenRouter connectivity
        fetch('https://openrouter.ai/api/v1/models', {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-store'
        }).catch(() => { throw new Error('blocked'); })
      ]);

      if (!mounted) return;

      const firebaseFailed = results[0].status === 'rejected';
      const llmFailed = results[1].status === 'rejected';

      setIsFirebaseBlocked(firebaseFailed);
      setIsLLMBlocked(llmFailed);

      if (firebaseFailed || llmFailed) {
        setStatus('obstructed');
      } else {
        setStatus('connected');
      }
    };

    const timer = setTimeout(checkConnectivity, 1000); // Slight delay to let initial page load settle

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, []);

  return { status, isFirebaseBlocked, isLLMBlocked };
}
