type NexusLinkStatus = 'queued' | 'complete' | 'error';

export interface NexusLinkResponse {
  id: string;
  status: NexusLinkStatus;
  message?: string;
  output?: string;
  exitCode?: number;
}

const DEFAULT_URL = 'ws://localhost:4343';

function resolveNexusLinkUrl(): string {
  const override = import.meta.env.VITE_NYX_LINK_URL as string | undefined;
  if (override && override.trim()) return override;
  return DEFAULT_URL;
}

export const NexusLinkClient = {
  async sendCommand(command: string): Promise<NexusLinkResponse> {
    const url = resolveNexusLinkUrl();

    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const id = crypto.randomUUID();
      const timeout = window.setTimeout(() => {
        socket.close();
        reject(new Error('nexus-link timeout'));
      }, 6000);

      const cleanup = () => {
        window.clearTimeout(timeout);
        socket.close();
      };

      socket.onopen = () => {
        socket.send(JSON.stringify({ id, command }));
      };

      socket.onerror = () => {
        cleanup();
        reject(new Error('nexus-link connection failed'));
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string) as NexusLinkResponse;
          if (payload.id !== id) return;
          if (payload.status === 'queued') return;
          cleanup();
          resolve(payload);
        } catch (error) {
          cleanup();
          reject(error as Error);
        }
      };
    });
  }
};
