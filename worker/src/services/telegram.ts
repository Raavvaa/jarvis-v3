import { TELEGRAM_API_BASE } from '../config';
import type { Env, TelegramFile } from '../types';
import { truncate } from '../utils/helpers';

export class TelegramService {
  private baseUrl: string;

  constructor(private env: Env) {
    this.baseUrl = `${TELEGRAM_API_BASE}${env.TELEGRAM_BOT_TOKEN}`;
  }

  async sendMessage(
    chatId: string,
    text: string,
    options: {
      parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
      replyToMessageId?: number;
      businessConnectionId?: string;
    } = {}
  ): Promise<void> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: truncate(text, 4096),
    };
    if (options.parseMode) body.parse_mode = options.parseMode;
    if (options.replyToMessageId) body.reply_to_message_id = options.replyToMessageId;
    if (options.businessConnectionId) body.business_connection_id = options.businessConnectionId;

    const res = await fetch(`${this.baseUrl}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[TG] sendMessage ${res.status}: ${err}`);
      if (options.parseMode && err.includes("can't parse")) {
        await this.sendMessage(chatId, truncate(text, 4096), { ...options, parseMode: undefined });
      }
    }
  }

  async sendLongMessage(chatId: string, text: string, options: { businessConnectionId?: string } = {}): Promise<void> {
    if (text.length <= 4000) {
      await this.sendMessage(chatId, text, options);
      return;
    }
    const parts: string[] = [];
    let cur = '';
    for (const para of text.split('\n\n')) {
      if ((cur + '\n\n' + para).length > 4000) {
        if (cur) parts.push(cur.trim());
        cur = para;
      } else {
        cur = cur ? cur + '\n\n' + para : para;
      }
    }
    if (cur) parts.push(cur.trim());

    for (const part of parts) {
      await this.sendMessage(chatId, part, options);
      await new Promise(r => setTimeout(r, 200));
    }
  }

  async sendChatAction(chatId: string, action: string = 'typing', businessConnectionId?: string): Promise<void> {
    const body: Record<string, unknown> = { chat_id: chatId, action };
    if (businessConnectionId) body.business_connection_id = businessConnectionId;
    await fetch(`${this.baseUrl}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {});
  }

  async getFile(fileId: string): Promise<TelegramFile | null> {
    const res = await fetch(`${this.baseUrl}/getFile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok: boolean; result?: TelegramFile };
    return data.result || null;
  }

  async downloadFileById(fileId: string): Promise<ArrayBuffer | null> {
    const file = await this.getFile(fileId);
    if (!file?.file_path) return null;
    const res = await fetch(`https://api.telegram.org/file/bot${this.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`);
    return res.ok ? res.arrayBuffer() : null;
  }

  async setWebhook(url: string, secretToken?: string): Promise<boolean> {
    const body: Record<string, unknown> = {
      url,
      allowed_updates: ['message', 'business_message', 'business_connection', 'callback_query'],
      max_connections: 40,
    };
    if (secretToken) body.secret_token = secretToken;
    const res = await fetch(`${this.baseUrl}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok: boolean };
    return data.ok;
  }

  async getMe(): Promise<{ id: number; username: string } | null> {
    const res = await fetch(`${this.baseUrl}/getMe`);
    const data = (await res.json()) as { ok: boolean; result?: { id: number; username: string } };
    return data.result || null;
  }
}
