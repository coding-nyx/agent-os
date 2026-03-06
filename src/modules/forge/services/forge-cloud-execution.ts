export type ForgeCloudExecutionResult = {
  status: 'success' | 'error';
  logs: string[];
  result?: string;
  error?: string;
  durationMs?: number;
};

function resolveFunctionsBaseUrl(): string {
  const explicit = import.meta.env.VITE_FUNCTIONS_BASE_URL as string | undefined;
  if (explicit) return explicit.replace(/\/$/, '');
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;
  if (!projectId) return '';
  return `https://us-central1-${projectId}.cloudfunctions.net`;
}

export const ForgeCloudExecutionService = {
  async executeCode(code: string, language: string): Promise<ForgeCloudExecutionResult> {
    const baseUrl = resolveFunctionsBaseUrl();
    if (!baseUrl) {
      throw new Error('No Forge execution backend configured');
    }

    const response = await fetch(`${baseUrl}/forgeExecute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        language
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Forge execution failed');
    }

    return response.json() as Promise<ForgeCloudExecutionResult>;
  }
};
