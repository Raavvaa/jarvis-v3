// ============================================
// Действия юзербота (MTProto)
// ============================================

import { TelegramClient } from 'telegram';
import { Api } from 'telegram/tl/index.js';
import bigInt from 'big-integer';

/**
 * Отправляет сообщение в чат
 */
export async function sendMessage(
  client: TelegramClient,
  chatId: string | number,
  text: string
): Promise<void> {
  await client.sendMessage(chatId, { message: text });
}

/**
 * Удаляет сообщения
 */
export async function deleteMessages(
  client: TelegramClient,
  chatId: string | number,
  messageIds: number[]
): Promise<void> {
  try {
    const peer = await client.getEntity(chatId);
    await client.deleteMessages(peer, messageIds, { revoke: true });
  } catch (e) {
    console.error('[Actions] deleteMessages:', (e as Error).message);
  }
}

/**
 * Редактирует сообщение
 */
export async function editMessage(
  client: TelegramClient,
  chatId: string | number,
  messageId: number,
  newText: string
): Promise<void> {
  await client.editMessage(chatId, { message: messageId, text: newText });
}

/**
 * Закрепляет сообщение
 */
export async function pinMessage(
  client: TelegramClient,
  chatId: string | number,
  messageId: number
): Promise<void> {
  const peer = await client.getEntity(chatId);
  await client.pinMessage(peer, messageId);
}

/**
 * Создаёт группу и добавляет участников
 */
export async function createGroup(
  client: TelegramClient,
  title: string,
  usernames: string[]
): Promise<string> {
  try {
    // Резолвим юзеров
    const users: Api.TypeInputUser[] = [];
    for (const u of usernames) {
      try {
        const entity = await client.getEntity(u);
        if (entity instanceof Api.User) {
          users.push(new Api.InputUser({
            userId: entity.id,
            accessHash: entity.accessHash || bigInt(0),
          }));
        }
      } catch (e) {
        console.warn(`[Actions] Can't resolve user ${u}:`, (e as Error).message);
      }
    }

    const result = await client.invoke(new Api.messages.CreateChat({
      title,
      users,
    }));

    console.log('[Actions] Group created:', title);
    return `Группа "${title}" создана с ${users.length} участниками`;
  } catch (e) {
    console.error('[Actions] createGroup:', (e as Error).message);
    throw e;
  }
}

/**
 * Добавляет участников в группу
 */
export async function addMembers(
  client: TelegramClient,
  chatId: string | number,
  usernames: string[]
): Promise<string> {
  const results: string[] = [];
  for (const u of usernames) {
    try {
      const entity = await client.getEntity(chatId);
      const user = await client.getEntity(u);

      if (entity instanceof Api.Chat || entity instanceof Api.Channel) {
        await client.invoke(new Api.messages.AddChatUser({
          chatId: entity.id,
          userId: new Api.InputUser({
            userId: (user as Api.User).id,
            accessHash: (user as Api.User).accessHash || bigInt(0),
          }),
          fwdLimit: 50,
        }));
        results.push(`✅ ${u} добавлен`);
      }
    } catch (e) {
      results.push(`❌ ${u}: ${(e as Error).message}`);
    }
  }
  return results.join('\n');
}

/**
 * Удаляет участника
 */
export async function removeMember(
  client: TelegramClient,
  chatId: string | number,
  username: string
): Promise<string> {
  try {
    const chat = await client.getEntity(chatId);
    const user = await client.getEntity(username);

    if (chat instanceof Api.Channel) {
      await client.invoke(new Api.channels.EditBanned({
        channel: new Api.InputChannel({
          channelId: chat.id,
          accessHash: chat.accessHash || bigInt(0),
        }),
        participant: new Api.InputPeerUser({
          userId: (user as Api.User).id,
          accessHash: (user as Api.User).accessHash || bigInt(0),
        }),
        bannedRights: new Api.ChatBannedRights({
          untilDate: 0,
          viewMessages: true,
        }),
      }));
    }
    return `✅ ${username} удалён`;
  } catch (e) {
    return `❌ Не удалось удалить ${username}: ${(e as Error).message}`;
  }
}

/**
 * Назначает администратором
 */
export async function setAdmin(
  client: TelegramClient,
  chatId: string | number,
  username: string
): Promise<string> {
  try {
    const chat = await client.getEntity(chatId);
    const user = await client.getEntity(username);

    if (chat instanceof Api.Channel) {
      await client.invoke(new Api.channels.EditAdmin({
        channel: new Api.InputChannel({
          channelId: chat.id,
          accessHash: chat.accessHash || bigInt(0),
        }),
        userId: new Api.InputUser({
          userId: (user as Api.User).id,
          accessHash: (user as Api.User).accessHash || bigInt(0),
        }),
        adminRights: new Api.ChatAdminRights({
          changeInfo: true,
          deleteMessages: true,
          banUsers: true,
          inviteUsers: true,
          pinMessages: true,
          manageCall: true,
        }),
        rank: 'admin',
      }));
    }
    return `✅ ${username} назначен админом`;
  } catch (e) {
    return `❌ ${(e as Error).message}`;
  }
}

/**
 * Ставит реакцию на сообщение
 */
export async function setReaction(
  client: TelegramClient,
  chatId: string | number,
  messageId: number,
  emoji: string
): Promise<void> {
  try {
    const peer = await client.getInputEntity(chatId);
    await client.invoke(new Api.messages.SendReaction({
      peer,
      msgId: messageId,
      reaction: [new Api.ReactionEmoji({ emoticon: emoji })],
    }));
  } catch (e) {
    console.error('[Actions] setReaction:', (e as Error).message);
  }
}

/**
 * Пересылает сообщение
 */
export async function forwardMessage(
  client: TelegramClient,
  fromChatId: string | number,
  toChatId: string | number,
  messageIds: number[]
): Promise<void> {
  await client.forwardMessages(toChatId, {
    messages: messageIds,
    fromPeer: fromChatId,
  });
}

/**
 * Получает информацию о пользователе
 */
export async function getUserInfo(
  client: TelegramClient,
  identifier: string
): Promise<string> {
  try {
    const entity = await client.getEntity(identifier);

    if (entity instanceof Api.User) {
      return [
        `👤 ${entity.firstName || ''} ${entity.lastName || ''}`.trim(),
        entity.username ? `@${entity.username}` : null,
        `ID: ${entity.id}`,
        entity.phone ? `📱 +${entity.phone}` : null,
        entity.bot ? '🤖 Бот' : null,
        entity.premium ? '⭐ Premium' : null,
      ].filter(Boolean).join('\n');
    }

    return `Не найден: ${identifier}`;
  } catch (e) {
    return `Ошибка: ${(e as Error).message}`;
  }
}
