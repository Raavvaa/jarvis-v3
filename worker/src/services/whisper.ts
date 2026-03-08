import type { Env } from '../types';

export async function transcribeAudio(audioBuffer: ArrayBuffer, env: Env): Promise<string | null> {
  try {
    console.log(`[Whisper] Transcribing ${audioBuffer.byteLength} bytes`);
    const result = await env.AI.run('@cf/openai/whisper-large-v3-turbo', {
      audio: [...new Uint8Array(audioBuffer)],
    });
    if (result && typeof result === 'object' && 'text' in result) {
      const text = (result as { text: string }).text.trim();
      console.log(`[Whisper] OK: "${text.slice(0, 80)}..."`);
      return text || null;
    }
    return null;
  } catch (error) {
    console.error('[Whisper] Error:', (error as Error).message);
    return null;
  }
}
