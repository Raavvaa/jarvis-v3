import { TelegramClient } from 'telegram';
import { CFG } from './config.js';
import { execute } from './executor.js';

const headers = {
  'Authorization': `Bearer ${CFG.workerSecret}`,
  'Content-Type': 'application/json',
};

interface QueueItem {
  id: number;
  command_type: string;
  chat_id: string | null;
  payload: string;
  status: string;
}

async function poll(client: TelegramClient): Promise<void> {
  try {
    const res = await fetch(`${CFG.workerUrl}/api/queue/poll`, { headers });
    if (!res.ok) { console.error(`[Poller] poll ${res.status}`); return; }
    const items = await res.json() as QueueItem[];
    if (items.length === 0) return;

    console.log(`[Poller] ${items.length} commands pending`);

    for (const item of items) {
      console.log(`[Poller] Executing: ${item.command_type} (id=${item.id})`);
      let result: string | undefined;
      let error: string | undefined;

      try {
        const payload = JSON.parse(item.payload);
        // Merge chat_id from queue row into payload if present
        if (item.chat_id && !payload.chatId) payload.chatId = item.chat_id;
        result = await execute(client, item.command_type, payload);
        console.log(`[Poller] ✅ ${item.command_type}: ${result.slice(0, 100)}`);
      } catch (e) {
        error = (e as Error).message;
        console.error(`[Poller] ❌ ${item.command_type}: ${error}`);
      }

      // Report back
      try {
        await fetch(`${CFG.workerUrl}/api/queue/push`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ id: item.id, result, error }),
        });
      } catch (e) {
        console.error(`[Poller] Report failed:`, (e as Error).message);
      }
    }
  } catch (e) {
    console.error('[Poller] Error:', (e as Error).message);
  }
}

export function startPoller(client: TelegramClient): void {
  console.log('📬 Queue poller started (every 2s)');
  setInterval(() => poll(client), 2000);
  // Also run immediately
  poll(client).catch(() => {});
}
