import type { Env, GroqMsg, GroqResp } from '../types';
import { GROQ_URL, MODEL_PRIMARY, MODEL_FALLBACK } from '../config';
import { withRetry } from '../utils/retry';

export class GroqSvc {
  constructor(private env: Env) {}

  async chat(msgs: GroqMsg[], opts: { model?: string; temp?: number; max?: number } = {}): Promise<GroqResp> {
    const start = Date.now();
    const model = opts.model || MODEL_PRIMARY;
    const body = { model, messages: msgs, temperature: opts.temp ?? 0.7, max_tokens: opts.max ?? 4096 };

    let apiKey = this.env.GROQ_API_KEY;
    let usedFallback = false;

    const doFetch = async (key: string, mdl: string) => {
      const b = { ...body, model: mdl };
      const r = await fetch(GROQ_URL, { method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`Groq ${r.status}: ${txt.slice(0, 300)}`);
      }
      return r.json() as Promise<GroqResp>;
    };

    let result: GroqResp;
    try {
      result = await withRetry(() => doFetch(apiKey, model), 2, 'Groq-primary');
    } catch (e) {
      const msg = (e as Error).message;
      console.warn(`[Groq] Primary failed: ${msg.slice(0, 100)}, trying fallback`);
      usedFallback = true;
      try {
        result = await withRetry(() => doFetch(this.env.GROQ_API_KEY_2, MODEL_FALLBACK), 2, 'Groq-fallback-key2');
      } catch {
        result = await withRetry(() => doFetch(this.env.GROQ_API_KEY, MODEL_FALLBACK), 2, 'Groq-fallback-key1');
      }
    }

    const ms = Date.now() - start;
    const usedModel = usedFallback ? MODEL_FALLBACK : model;
    console.log(`[Groq] ${ms}ms model=${usedModel} tokens=${result.usage?.total_tokens || '?'}`);
    this.env.DB.prepare('INSERT INTO request_logs (model,tokens_in,tokens_out,latency_ms,source) VALUES (?,?,?,?,?)').bind(usedModel, result.usage?.prompt_tokens || 0, result.usage?.completion_tokens || 0, ms, 'bot').run().catch(() => {});
    return result;
  }

  async complete(msgs: GroqMsg[], model?: string): Promise<string> {
    const r = await this.chat(msgs, { model });
    return r.choices?.[0]?.message?.content || '';
  }
}
