export type Item = { id: string; revision: number; [key: string]: any };
// Runtime diagnostics, commands, paths and model output are user content, not UI branding.
export const brand = (s: unknown) => String(s ?? '');

export function profilePath(profile: Item, suffix: string): string {
  const machine = profile._runtime_target?.machine_id;
  return `/profiles/${profile.id}${suffix}${machine ? (suffix.includes('?') ? '&' : '?') + 'machine_id=' + encodeURIComponent(machine) : ''}`;
}
let computerSession: Promise<string> | null = null;

export function computerToken(): Promise<string> {
  if (!computerSession) computerSession = fetch('/api/v1/cua/session').then(async r => {
    if (!r.ok) throw new Error('Open System Control from the local dashboard.');
    return (await r.json()).token;
  }).catch(e => { computerSession = null; throw e; });
  return computerSession;
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const authorization: Record<string, string> = path.startsWith('/cua/') && path !== '/cua/session'
    ? { Authorization: 'Bearer ' + await computerToken() } : {};
  const response = await fetch('/api/v1' + path, {
    ...options, headers: { 'Content-Type': 'application/json', ...authorization, ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(brand(data.error?.detail || data.detail || `Request failed (${response.status})`));
  return data;
}

export const post = <T = any>(path: string, data: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(data) });
export const put = <T = any>(path: string, data: unknown) => api<T>(path, { method: 'PUT', body: JSON.stringify(data) });
export const patch = <T = any>(path: string, data: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(data) });
export const del = <T = any>(path: string) => api<T>(path, { method: 'DELETE' });
