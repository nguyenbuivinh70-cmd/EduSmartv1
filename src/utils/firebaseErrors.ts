/** Preserve Firebase codes through the UI/service error wrappers. */
export function firebaseErrorCode(error: unknown): string {
  const seen = new Set<unknown>();
  let current: any = error;
  while (current && !seen.has(current)) {
    seen.add(current);
    const code = String(current.code || '').replace(/^firestore\//, '').toLowerCase();
    if (code) return code;
    current = current.cause;
  }
  return '';
}

export function isFirestoreQuotaError(error: unknown) {
  return firebaseErrorCode(error) === 'resource-exhausted'
    || /resource-exhausted|RESOURCE_EXHAUSTED/.test(String((error as any)?.message || error || ''));
}

/** Retry contention only. Quota, permission and offline errors stop immediately. */
export async function retryLessonContention<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      if (firebaseErrorCode(error) !== 'aborted' || attempt >= 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
}
