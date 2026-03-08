export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  label: string = 'operation'
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const msg = lastError.message || '';
      const isRetryable = msg.includes('429') || msg.includes('rate') || msg.includes('503') || msg.includes('timeout');

      if (!isRetryable || attempt === maxRetries - 1) {
        console.error(`[Retry] ${label} failed after ${attempt + 1} attempts:`, msg);
        throw lastError;
      }

      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      console.warn(`[Retry] ${label} attempt ${attempt + 1}/${maxRetries}, retry in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  throw lastError || new Error(`${label} failed`);
}
