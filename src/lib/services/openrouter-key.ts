export function resolveOpenRouterKey(explicitKey?: string): string {
  if (explicitKey && explicitKey.trim().length > 0) return explicitKey.trim();

  const fromEnv = (import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined) ?? '';
  if (fromEnv.trim().length > 0) return fromEnv.trim();

  if (typeof window !== 'undefined') {
    const fromLocal =
      localStorage.getItem('VITE_OPENROUTER_API_KEY') ||
      localStorage.getItem('openrouter_api_key') ||
      localStorage.getItem('OPENROUTER_API_KEY');
    if (fromLocal && fromLocal.trim().length > 0) return fromLocal.trim();
  }

  return '';
}

export function isOpenRouterAuthError(message: string): boolean {
  return /(missing authentication header|unauthorized|401|invalid api key|auth)/i.test(message);
}
