/**
 * Shared utility for safe Firestore operations with contextual error logging.
 */
export async function safeFirestoreOp<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    console.error(`[Firestore] ${context}:`, error);
    return null;
  }
}
