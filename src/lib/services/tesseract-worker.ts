import type { Worker } from 'tesseract.js';

const IDLE_TIMEOUT_MS = 60_000;

let workerInstance: Worker | null = null;
let initPromise: Promise<Worker> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function clearIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function scheduleIdleShutdown() {
  if (!workerInstance) return;
  clearIdleTimer();
  idleTimer = setTimeout(() => {
    void shutdownWorker();
  }, IDLE_TIMEOUT_MS);
}

async function createWorkerInstance(): Promise<Worker> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  return worker;
}

async function ensureWorker(): Promise<Worker> {
  if (workerInstance) {
    scheduleIdleShutdown();
    return workerInstance;
  }
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const worker = await createWorkerInstance();
      workerInstance = worker;
      scheduleIdleShutdown();
      return worker;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

export async function recognizeImageWithWorker(imageDataUrl: string): Promise<string> {
  const worker = await ensureWorker();
  try {
    const result = await worker.recognize(imageDataUrl);
    return (result?.data?.text || '').trim();
  } finally {
    scheduleIdleShutdown();
  }
}

export async function shutdownWorker(): Promise<void> {
  clearIdleTimer();
  initPromise = null;
  const worker = workerInstance;
  workerInstance = null;
  if (!worker) return;

  try {
    await worker.terminate();
  } catch (error) {
    console.warn('[TesseractWorker] Failed to terminate worker:', error);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    void shutdownWorker();
  });
}
