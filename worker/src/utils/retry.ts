export async function withRetry<T>(fn: () => Promise<T>, retries = 3, label = 'op'): Promise<T> {
  let last: Error | null = null;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e as Error;
      const msg = last.message || '';
      const retryable = msg.includes('429') || msg.includes('503') || msg.includes('timeout') || msg.includes('rate');
      if (!retryable || i === retries - 1) throw last;
      const delay = Math.pow(2, i) * 1000 + Math.random() * 500;
      console.warn(`[Retry] ${label} attempt ${i + 1}/${retries}, wait ${Math.round(delay)}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw last!;
}
