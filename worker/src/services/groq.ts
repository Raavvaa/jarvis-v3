import type { Env, GroqMessage, GroqResponse } from '../types';
import { GROQ_API_URL } from '../config';
import { withRetry } from '../utils/retry';

export class GroqService {
  constructor(private env: Env) {}

  async chat(messages: GroqMessage[], options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  } = {}): Promise<GroqResponse> {
    const start = Date.now();
    const body: Record<string, unknown> = {
      model: options.model || 'compound-beta',
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
    };

    const result = await withRetry(async () => {
      const res = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
      return res.json() as Promise<GroqResponse>;
    }, 3, 'Groq');

    const ms = Date.now() - start;
    console.log(`[Groq] ${ms}ms, model=${options.model || 'compound-beta'}, tokens=${result.usage?.total_tokens || '?'}`);

    // Лог (не блокируем)
    this.env.DB.prepare(
      `INSERT INTO request_logs (model, tokens_in, tokens_out, latency_ms, source) VALUES (?,?,?,?,?)`
    ).bind(
      options.model || 'compound-beta',
      result.usage?.prompt_tokens || 0,
      result.usage?.completion_tokens || 0,
      ms,
      options.model?.includes('8b') ? 'bot' : 'userbot'
    ).run().catch(() => {});

    return result;
  }

  async getCompletion(messages: GroqMessage[], model?: string): Promise<string> {
    const res = await this.chat(messages, { model });
    return res.choices?.[0]?.message?.content || '';
  }
}
