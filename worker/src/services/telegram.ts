import { TG_API } from '../config';
import type { Env, TgFile } from '../types';
import { trunc } from '../utils/helpers';

export class TgSvc {
  private base: string;
  constructor(private env: Env) {
    this.base = `${TG_API}${env.TELEGRAM_BOT_TOKEN}`;
  }

  async send(chatId: string, text: string, opts: { parse?: string; reply?: number; biz?: string } = {}): Promise<boolean> {
    const body: Record<string, unknown> = { chat_id: chatId, text: trunc(text, 4096) };
    if (opts.parse) body.parse_mode = opts.parse;
    if (opts.reply) body.reply_to_message_id = opts.reply;
    if (opts.biz) body.business_connection_id = opts.biz;
    const r = await fetch(`${this.base}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) {
      const e = await r.text();
      console.error(`[TG] send ${r.status}: ${e.slice(0, 200)}`);
      if (opts.parse && e.includes("can't parse")) return this.send(chatId, trunc(text, 4096), { ...opts, parse: undefined });
      return false;
    }
    return true;
  }

  async sendLong(chatId: string, text: string, opts: { biz?: string } = {}): Promise<void> {
    if (text.length <= 4000) { await this.send(chatId, text, opts); return; }
    const parts: string[] = [];
    let cur = '';
    for (const p of text.split('\n\n')) {
      if ((cur + '\n\n' + p).length > 4000) { if (cur) parts.push(cur.trim()); cur = p; }
      else cur = cur ? cur + '\n\n' + p : p;
    }
    if (cur) parts.push(cur.trim());
    for (const part of parts) { await this.send(chatId, part, opts); await new Promise(r => setTimeout(r, 200)); }
  }

  async typing(chatId: string, biz?: string): Promise<void> {
    const body: Record<string, unknown> = { chat_id: chatId, action: 'typing' };
    if (biz) body.business_connection_id = biz;
    await fetch(`${this.base}/sendChatAction`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
  }

  async getFile(fileId: string): Promise<TgFile | null> {
    const r = await fetch(`${this.base}/getFile`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_id: fileId }) });
    if (!r.ok) return null;
    const d = (await r.json()) as { ok: boolean; result?: TgFile };
    return d.result || null;
  }

  async downloadById(fileId: string): Promise<ArrayBuffer | null> {
    const f = await this.getFile(fileId);
    if (!f?.file_path) return null;
    const r = await fetch(`https://api.telegram.org/file/bot${this.env.TELEGRAM_BOT_TOKEN}/${f.file_path}`);
    return r.ok ? r.arrayBuffer() : null;
  }

  async setWebhook(url: string, secret?: string): Promise<boolean> {
    const body: Record<string, unknown> = { url, allowed_updates: ['message', 'business_message', 'business_connection', 'callback_query'], max_connections: 40 };
    if (secret) body.secret_token = secret;
    const r = await fetch(`${this.base}/setWebhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = (await r.json()) as { ok: boolean };
    console.log('[TG] setWebhook:', d.ok);
    return d.ok;
  }

  async getMe(): Promise<{ id: number; username: string } | null> {
    const r = await fetch(`${this.base}/getMe`);
    const d = (await r.json()) as { ok: boolean; result?: { id: number; username: string } };
    return d.result || null;
  }
}
