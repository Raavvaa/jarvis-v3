// ============================================
// MTProto Client
// ============================================

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { CONFIG } from './config.js';
import * as workerApi from './worker-api.js';
import * as actions from './actions.js';

let clientInstance: TelegramClient | null = null;

/**
 * Создаёт и подключает MTProto клиент
 */
export async function createClient(): Promise<TelegramClient> {
  if (clientInstance) return clientInstance;

  console.log('🔌 Connecting to Telegram...');

  const session = new StringSession(CONFIG.sessionString);
  const client = new TelegramClient(session, CONFIG.apiId, CONFIG.apiHash, {
    connectionRetries: 10,
    retryDelay: 1000,
    autoReconnect: true,
    floodSleepThreshold: 60,
  });

  await client.connect();

  // Проверяем авторизацию
  const me = await client.getMe();
  if (me instanceof Object && 'firstName' in me) {
    console.log(`✅ Connected as: ${(me as any).firstName} (ID: ${(me as any).id})`);
  }

  clientInstance = client;
  return client;
}

/**
 * Запускает обработку очереди команд (polling)
 */
export async function startQueueProcessor(client: TelegramClient): Promise<void> {
  console.log('📬 Starting queue processor...');

  const processQueue = async () => {
    try {
      const commands = await workerApi.getPendingCommands();

      for (const cmd of commands) {
        console.log(`[Queue] Processing command: ${cmd.command_type} (id=${cmd.id})`);

        try {
          const payload = JSON.parse(cmd.payload);
          let result = '';

          switch (cmd.command_type) {
            case 'send_message':
              await actions.sendMessage(client, cmd.chat_id || payload.chatId, payload.text);
              result = 'Message sent';
              break;

            case 'delete_message':
              await actions.deleteMessages(client, cmd.chat_id || payload.chatId, payload.message_ids);
              result = 'Messages deleted';
              break;

            case 'edit_message':
              await actions.editMessage(client, cmd.chat_id || payload.chatId, payload.message_id, payload.text);
              result = 'Message edited';
              break;

            case 'pin_message':
              await actions.pinMessage(client, cmd.chat_id || payload.chatId, payload.message_id);
              result = 'Message pinned';
              break;

            case 'create_group':
              result = await actions.createGroup(client, payload.title, payload.users || []);
              break;

            case 'add_members':
              result = await actions.addMembers(client, cmd.chat_id || payload.chatId, payload.users || []);
              break;

            case 'remove_member':
              result = await actions.removeMember(client, cmd.chat_id || payload.chatId, payload.user);
              break;

            case 'set_admin':
              result = await actions.setAdmin(client, cmd.chat_id || payload.chatId, payload.user);
              break;

            case 'set_reaction':
              await actions.setReaction(client, cmd.chat_id || payload.chatId, payload.message_id, payload.emoji);
              result = 'Reaction set';
              break;

            case 'forward_message':
              await actions.forwardMessage(client, payload.from_chat_id, payload.to_chat_id, payload.message_ids);
              result = 'Message forwarded';
              break;

            case 'get_user_info':
              result = await actions.getUserInfo(client, payload.identifier);
              break;

            default:
              result = `Unknown command: ${cmd.command_type}`;
          }

          await workerApi.completeCommand(cmd.id, result);
          console.log(`[Queue] ✅ ${cmd.command_type}: ${result.slice(0, 100)}`);

        } catch (e) {
          const errorMsg = (e as Error).message;
          console.error(`[Queue] ❌ ${cmd.command_type}:`, errorMsg);
          await workerApi.completeCommand(cmd.id, undefined, errorMsg);
        }
      }
    } catch (e) {
      console.error('[Queue] Processor error:', (e as Error).message);
    }
  };

  // Проверяем очередь каждые 2 секунды
  setInterval(processQueue, 2000);
  console.log('✅ Queue processor started (polling every 2s)');
}
