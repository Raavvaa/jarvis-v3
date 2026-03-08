// ============================================
// JARVIS Userbot — Точка входа
// ============================================

import { createClient, startQueueProcessor } from './client.js';
import { setupHandlers } from './handler.js';
import { CONFIG } from './config.js';

async function main() {
  console.log(`
╔═══════════════════════════════════════╗
║   🤖 JARVIS Userbot v3.0             ║
║   MTProto + Cloudflare Workers        ║
╚═══════════════════════════════════════╝
  `);

  // Проверяем наличие сессии
  if (!CONFIG.sessionString) {
    console.error('❌ SESSION_STRING не найден!');
    console.error('   Запусти: npm run auth');
    process.exit(1);
  }

  // Подключаемся
  const client = await createClient();

  // Регистрируем обработчики сообщений
  setupHandlers(client);

  // Запускаем обработчик очереди команд
  await startQueueProcessor(client);

  console.log(`
✅ JARVIS Userbot запущен и работает!

📡 Worker URL: ${CONFIG.workerUrl}
👤 Owner ID: ${CONFIG.myTelegramId}
🕐 Timezone: UTC+${CONFIG.timezoneOffset}

Команды в Telegram:
  • "Джарвис, ..." — в любом чате
  • Просто текст — в Saved Messages
  • "Джарвис, не общайся" — заглушить в чате
  `);

  // Держим процесс живым
  process.on('SIGINT', async () => {
    console.log('\n🔌 Disconnecting...');
    await client.disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await client.disconnect();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
