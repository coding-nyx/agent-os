type WebSocketCtor = new (url: string, protocols?: string | string[]) => WebSocket;

const wsDefault: WebSocketCtor = (globalThis as any).WebSocket;

export default wsDefault;
