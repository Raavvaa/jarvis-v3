import { TelegramClient } from 'telegram';
import { Api } from 'telegram/tl/index.js';
import bigInt from 'big-integer';

export async function execute(client: TelegramClient, type: string, payload: Record<string, unknown>): Promise<string> {
  switch (type) {
    case 'send_message': {
      const chatId = payload.chatId as string | number;
      const text = payload.text as string;
      if (!chatId || !text) return 'Missing chatId or text';
      await client.sendMessage(chatId, { message: text });
      return `Sent to ${chatId}`;
    }

    case 'send_to_saved': {
      const text = payload.text as string;
      if (!text) return 'Missing text';
      await client.sendMessage('me', { message: `📌 ${text}` });
      return 'Saved to favorites';
    }

    case 'delete_message': {
      const chatId = payload.chatId as string | number;
      const msgId = payload.messageId as number;
      if (!chatId || !msgId) return 'Missing chatId or messageId';
      const peer = await client.getEntity(chatId);
      await client.deleteMessages(peer, [msgId], { revoke: true });
      return `Deleted msg ${msgId}`;
    }

    case 'kick_user': {
      const chatId = payload.chatId as string | number;
      const userId = payload.userId as number;
      if (!chatId || !userId) return 'Missing params';
      try {
        const channel = await client.getEntity(chatId);
        const user = await client.getEntity(userId);
        if ('id' in channel && 'accessHash' in channel) {
          await client.invoke(new Api.channels.EditBanned({
            channel: new Api.InputChannel({ channelId: (channel as any).id, accessHash: (channel as any).accessHash || bigInt(0) }),
            participant: new Api.InputPeerUser({ userId: (user as any).id, accessHash: (user as any).accessHash || bigInt(0) }),
            bannedRights: new Api.ChatBannedRights({ untilDate: 0, viewMessages: true, sendMessages: true, sendMedia: true, sendStickers: true, sendGifs: true, sendGames: true, sendInline: true, embedLinks: true }),
          }));
        }
        return `Kicked user ${userId}`;
      } catch (e) { return `Kick failed: ${(e as Error).message}`; }
    }

    case 'ban_user': {
      const chatId = payload.chatId as string | number;
      const userId = payload.userId as number;
      if (!chatId || !userId) return 'Missing params';
      try {
        const channel = await client.getEntity(chatId);
        const user = await client.getEntity(userId);
        if ('id' in channel && 'accessHash' in channel) {
          await client.invoke(new Api.channels.EditBanned({
            channel: new Api.InputChannel({ channelId: (channel as any).id, accessHash: (channel as any).accessHash || bigInt(0) }),
            participant: new Api.InputPeerUser({ userId: (user as any).id, accessHash: (user as any).accessHash || bigInt(0) }),
            bannedRights: new Api.ChatBannedRights({ untilDate: 0, viewMessages: true }),
          }));
        }
        return `Banned user ${userId}`;
      } catch (e) { return `Ban failed: ${(e as Error).message}`; }
    }

    case 'promote_admin': {
      const chatId = payload.chatId as string | number;
      const userId = payload.userId as number;
      if (!chatId || !userId) return 'Missing params';
      try {
        const channel = await client.getEntity(chatId);
        const user = await client.getEntity(userId);
        if ('id' in channel && 'accessHash' in channel) {
          await client.invoke(new Api.channels.EditAdmin({
            channel: new Api.InputChannel({ channelId: (channel as any).id, accessHash: (channel as any).accessHash || bigInt(0) }),
            userId: new Api.InputUser({ userId: (user as any).id, accessHash: (user as any).accessHash || bigInt(0) }),
            adminRights: new Api.ChatAdminRights({ changeInfo: true, deleteMessages: true, banUsers: true, inviteUsers: true, pinMessages: true, manageCall: true }),
            rank: 'admin',
          }));
        }
        return `Promoted user ${userId}`;
      } catch (e) { return `Promote failed: ${(e as Error).message}`; }
    }

    case 'demote_admin': {
      const chatId = payload.chatId as string | number;
      const userId = payload.userId as number;
      if (!chatId || !userId) return 'Missing params';
      try {
        const channel = await client.getEntity(chatId);
        const user = await client.getEntity(userId);
        if ('id' in channel && 'accessHash' in channel) {
          await client.invoke(new Api.channels.EditAdmin({
            channel: new Api.InputChannel({ channelId: (channel as any).id, accessHash: (channel as any).accessHash || bigInt(0) }),
            userId: new Api.InputUser({ userId: (user as any).id, accessHash: (user as any).accessHash || bigInt(0) }),
            adminRights: new Api.ChatAdminRights({ changeInfo: false, deleteMessages: false, banUsers: false, inviteUsers: false, pinMessages: false, manageCall: false }),
            rank: '',
          }));
        }
        return `Demoted user ${userId}`;
      } catch (e) { return `Demote failed: ${(e as Error).message}`; }
    }

    case 'get_chat_members': {
      const chatId = payload.chatId as string | number;
      if (!chatId) return 'Missing chatId';
      try {
        const entity = await client.getEntity(chatId);
        if (entity instanceof Api.Channel) {
          const result = await client.invoke(new Api.channels.GetParticipants({
            channel: new Api.InputChannel({ channelId: entity.id, accessHash: entity.accessHash || bigInt(0) }),
            filter: new Api.ChannelParticipantsRecent(),
            offset: 0,
            limit: 50,
            hash: bigInt(0),
          }));
          if (result instanceof Api.channels.ChannelParticipants) {
            const users = result.users.filter((u): u is Api.User => u instanceof Api.User);
            return users.map(u => `${u.firstName || ''} ${u.lastName || ''} (@${u.username || 'no_username'}) ID:${u.id}`).join('\n');
          }
        }
        return 'Could not get members (not a channel/supergroup)';
      } catch (e) { return `Failed: ${(e as Error).message}`; }
    }

    case 'forward_message': {
      const from = payload.fromChatId as string | number;
      const to = payload.toChatId as string | number;
      const msgId = payload.messageId as number;
      if (!from || !to || !msgId) return 'Missing params';
      await client.forwardMessages(to, { messages: [msgId], fromPeer: from });
      return `Forwarded msg ${msgId} from ${from} to ${to}`;
    }

    case 'read_messages': {
      const chatId = payload.chatId as string | number;
      if (!chatId) return 'Missing chatId';
      await client.markAsRead(chatId);
      return `Marked ${chatId} as read`;
    }

    default:
      return `Unknown command: ${type}`;
  }
}
