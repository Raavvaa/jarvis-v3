import type { Env } from '../types';

export async function transcribe(buf: ArrayBuffer, env: Env): Promise<string | null> {
  try {
    const r = await env.AI.run('@cf/openai/whisper-large-v3-turbo', { audio: [...new Uint8Array(buf)] });
    if (r && typeof r === 'object' && 'text' in r) {
      const t = (r as { text: string }).text.trim();
      return t || null;
    }
    return null;
  } catch (e) {
    console.error('[Whisper]', (e as Error).message);
    return null;
  }
}
