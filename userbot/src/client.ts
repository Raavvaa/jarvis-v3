import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { CFG } from './config.js';

let instance: TelegramClient | null = null;

export async function createClient(): Promise<TelegramClient> {
  if (instance) return instance;

  console.log('🔌 Connecting to Telegram MTProto...');

  const session = new StringSession(CFG.session);
  const client = new TelegramClient(session, CFG.apiId, CFG.apiHash, {
    connectionRetries: 10,
    retryDelay: 1000,
    autoReconnect: true,
    floodSleepThreshold: 60,
  });

  await client.connect();

  const me = await client.getMe() as any;
  console.log(`✅ Connected as: ${me?.firstName || '?'} (ID: ${me?.id || '?'})`);

  instance = client;
  return client;
}
