export type Item = { id: string; revision: number; [key: string]: any };
// Runtime diagnostics, commands, paths and model output are user content, not UI branding.
export const brand = (s: unknown) => String(s ?? '');

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch('/api/v1' + path, {
    ...options, headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(brand(data.error?.detail || data.detail || `Request failed (${response.status})`));
  return data;
}

export const post = <T = any>(path: string, data: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(data) });
export const put = <T = any>(path: string, data: unknown) => api<T>(path, { method: 'PUT', body: JSON.stringify(data) });
export const patch = <T = any>(path: string, data: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(data) });
