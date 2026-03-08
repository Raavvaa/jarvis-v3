// ============================================
// Скрипт авторизации — запускается один раз
// Генерирует SESSION_STRING для .env
// ============================================

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import input from 'input';
import { CONFIG } from './config.js';

async function main() {
  console.log('🔑 Авторизация в Telegram...\n');
  console.log('API_ID:', CONFIG.apiId);
  console.log('API_HASH:', CONFIG.apiHash.slice(0, 8) + '...\n');

  const session = new StringSession('');
  const client = new TelegramClient(session, CONFIG.apiId, CONFIG.apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await input.text('📱 Номер телефона (с кодом страны): '),
    password: async () => await input.text('🔒 Пароль 2FA (если есть, иначе Enter): '),
    phoneCode: async () => await input.text('📨 Код из Telegram: '),
    onError: (err) => console.error('Ошибка:', err),
  });

  console.log('\n✅ Авторизация успешна!');
  console.log('\n📋 Скопируй эту строку сессии в .env (SESSION_STRING):\n');
  console.log(client.session.save());
  console.log('\n⚠️ НИКОМУ не показывай эту строку! Она даёт полный доступ к аккаунту.');

  await client.disconnect();
  process.exit(0);
}

main().catch(console.error);
