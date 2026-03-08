// ============================================
// Все типы проекта — v3 с поддержкой юзербота
// ============================================

export interface Env {
  DB: D1Database;
  AI: Ai;
  TELEGRAM_BOT_TOKEN: string;
  GROQ_API_KEY: string;
  WEBHOOK_SECRET: string;
  MY_TELEGRAM_ID: string;
  WORKER_API_SECRET: string;
  BOT_NAME: string;
  TIMEZONE_OFFSET: string;
}

// ============================================
// Telegram Types
// ============================================

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  business_message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  business_connection?: TelegramBusinessConnection;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  voice?: TelegramVoice;
  audio?: TelegramAudio;
  photo?: TelegramPhotoSize[];
  video?: TelegramVideo;
  document?: TelegramDocument;
  sticker?: TelegramSticker;
  caption?: string;
  reply_to_message?: TelegramMessage;
  entities?: TelegramEntity[];
  business_connection_id?: string;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TelegramVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramAudio {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramVideo {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramSticker {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  is_animated: boolean;
  emoji?: string;
  set_name?: string;
}

export interface TelegramEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: TelegramUser;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramBusinessConnection {
  id: string;
  user: TelegramUser;
  user_chat_id: number;
  date: number;
  can_reply: boolean;
  is_enabled: boolean;
}

export interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

// ============================================
// Database Row Types
// ============================================

export interface DBMessage {
  id: number;
  chat_id: string;
  user_id: string | null;
  user_name: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  media_type: string | null;
  media_file_id: string | null;
  caption: string | null;
  transcribed: number;
  transcription: string | null;
  raw_data: string | null;
  source: string;
  created_at: string;
}

export interface DBPreference {
  id: number;
  user_id: string;
  key: string;
  value: string;
  category: string;
  updated_at: string;
}

export interface DBReminder {
  id: number;
  user_id: string;
  chat_id: string;
  text: string;
  remind_at: string;
  created_at: string;
  sent: number;
  source: string;
}

export interface DBContact {
  id: number;
  telegram_id: string | null;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  nickname: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DBChatSetting {
  id: number;
  chat_id: string;
  chat_title: string | null;
  is_silent: number;
  is_active: number;
  ignore_users: string | null;
  updated_at: string;
}

export interface DBCommandQueue {
  id: number;
  command_type: string;
  chat_id: string | null;
  payload: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  result: string | null;
  error: string | null;
  created_at: string;
  processed_at: string | null;
}

// ============================================
// Groq Types
// ============================================

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_calls?: GroqToolCall[];
  tool_call_id?: string;
}

export interface GroqToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface GroqResponse {
  id: string;
  choices: Array<{
    message: GroqMessage;
    finish_reason: string;
    index: number;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: {
    message: string;
    type: string;
    code: string;
  };
}

// ============================================
// Command Queue Types
// ============================================

export type CommandType =
  | 'send_message'
  | 'delete_message'
  | 'edit_message'
  | 'pin_message'
  | 'create_group'
  | 'add_members'
  | 'remove_member'
  | 'set_admin'
  | 'set_reaction'
  | 'forward_message'
  | 'get_user_info';

export interface QueueCommand {
  type: CommandType;
  chatId?: string;
  payload: Record<string, unknown>;
}

// ============================================
// Internal Types
// ============================================

export interface ProcessedMessage {
  chatId: string;
  userId: string;
  userName: string;
  text: string;
  isTriggered: boolean;
  triggerType?: 'name' | 'command' | 'mention' | 'reply';
  cleanedText: string;
  hasVoice: boolean;
  hasPhoto: boolean;
  voiceFileId?: string;
  photoFileId?: string;
  mediaCaption?: string;
  isGroup: boolean;
  isFromOwner: boolean;
  rawMessage: TelegramMessage;
  businessConnectionId?: string;
}

export interface LLMActionResponse {
  reply: string;
  actions?: Array<{
    type: 'save_preference' | 'set_reminder' | 'change_mode'
      | 'save_contact' | 'queue_command' | 'set_silent' | 'ignore_user' | 'none';
    key?: string;
    value?: string;
    remind_at?: string;
    text?: string;
    mode?: string;
    contact?: {
      username?: string;
      telegram_id?: string;
      first_name?: string;
      role?: string;
      nickname?: string;
      notes?: string;
    };
    command?: QueueCommand;
    silent?: boolean;
    ignore_user_id?: string;
  }>;
  mood?: string;
  suggestion?: string;
}
