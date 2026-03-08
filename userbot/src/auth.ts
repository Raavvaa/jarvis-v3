import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import input from 'input';
import { CFG } from './config.js';

async function main() {
  console.log('🔑 Telegram MTProto Authorization\n');
  console.log('API_ID:', CFG.apiId);
  console.log('API_HASH:', CFG.apiHash.slice(0, 8) + '...\n');

  const session = new StringSession('');
  const client = new TelegramClient(session, CFG.apiId, CFG.apiHash, { connectionRetries: 5 });

  await client.start({
    phoneNumber: async () => await input.text('📱 Phone number (with country code): '),
    password: async () => await input.text('🔒 2FA password (or press Enter): '),
    phoneCode: async () => await input.text('📨 Code from Telegram: '),
    onError: (err: Error) => console.error('Error:', err.message),
  });

  console.log('\n✅ Authorization successful!');
  console.log('\n📋 Copy this SESSION_STRING to your .env:\n');
  const saved = client.session.save() as unknown as string;
  console.log(saved);
  console.log('\n⚠️ NEVER share this string. It gives full access to your account.');

  await client.disconnect();
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
