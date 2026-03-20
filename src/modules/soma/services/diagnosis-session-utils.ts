const DEFAULT_ANALYSIS_TIMEOUT_MS = 60_000;
const PDF_ANALYSIS_TIMEOUT_MS = 90_000;
const IMAGE_ANALYSIS_TIMEOUT_MS = 120_000;

export function getDiagnosisAnalysisTimeoutMs(file: File): number {
  if (file.type.startsWith('image/')) return IMAGE_ANALYSIS_TIMEOUT_MS;
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) return PDF_ANALYSIS_TIMEOUT_MS;
  return DEFAULT_ANALYSIS_TIMEOUT_MS;
}

export function isStorageObjectNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
  return code === 'storage/object-not-found';
}
