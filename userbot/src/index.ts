import { createClient } from './client.js';
import { setupHandlers } from './handler.js';
import { startPoller } from './poller.js';
import { CFG } from './config.js';

async function main() {
  console.log(`
╔═══════════════════════════════════════╗
║   🤖 JARVIS Userbot v4.0             ║
║   MTProto + Cloudflare Workers        ║
╚═══════════════════════════════════════╝
  `);

  if (!CFG.session) {
    console.error('❌ SESSION_STRING not found!');
    console.error('   Run: npm run auth');
    process.exit(1);
  }

  const client = await createClient();

  // Register message handlers (reads all messages, responds to owner)
  setupHandlers(client);

  // Start polling worker queue for commands
  startPoller(client);

  console.log(`
✅ JARVIS Userbot is running!

📡 Worker: ${CFG.workerUrl}
👤 Owner: ${CFG.myId}
🕐 TZ: UTC+${CFG.tz}

Triggers: джарвис, jarvis, бро, /j, /ask
Saved Messages: always active (no trigger)
  `);

  // Keep alive
  process.on('SIGINT', async () => {
    console.log('\n🔌 Disconnecting...');
    await client.disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🔌 Disconnecting (SIGTERM)...');
    await client.disconnect();
    process.exit(0);
  });

  // Prevent unhandled rejections from crashing
  process.on('unhandledRejection', (reason) => {
    console.error('[UNHANDLED]', reason);
  });
}

main().catch((e) => {
  console.error('💥 Fatal:', e);
  process.exit(1);
});
