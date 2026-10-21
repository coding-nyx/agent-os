export type Item = { id: string; revision: number; [key: string]: any };
// Runtime diagnostics, commands, paths and model output are user content, not UI branding.
export const brand = (s: unknown) => String(s ?? '');

// Private HTTP dashboards do not have navigator.clipboard. The synchronous
// fallback still runs in the button's user gesture and reports real failure.
export async function copyText(value: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return; }
  } catch { /* Try the browser's selection-based copy path. */ }
  const focus = document.activeElement as HTMLElement | null;
  const selection = window.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
  const field = document.createElement('textarea');
  field.value = value; field.setAttribute('aria-label', 'Text to copy');
  Object.assign(field.style, { position: 'fixed', top: '0', left: '0', opacity: '0', pointerEvents: 'none' });
  // A modal dialog makes everything outside it inert.
  (document.querySelector('dialog[open]') || document.body).appendChild(field);
  let copied = false;
  try { field.select(); copied = document.execCommand('copy'); }
  finally {
    field.remove(); focus?.focus({ preventScroll: true });
    if (selection && ranges.length) { selection.removeAllRanges(); ranges.forEach(range => selection.addRange(range)); }
  }
  if (!copied) throw new Error('Clipboard unavailable. Select the text and copy it manually.');
}

// getRandomValues is also available on private HTTP origins, where browsers
// omit randomUUID. These IDs identify operations; they are not credentials.
export function operationId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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
