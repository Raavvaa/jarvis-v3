export interface Env {
  DB: D1Database;
  AI: Ai;
  TELEGRAM_BOT_TOKEN: string;
  GROQ_API_KEY: string;
  GROQ_API_KEY_2: string;
  WEBHOOK_SECRET: string;
  MY_TELEGRAM_ID: string;
  WORKER_API_SECRET: string;
  BOT_NAME: string;
  TIMEZONE_OFFSET: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  business_message?: TgMessage;
  callback_query?: TgCallbackQuery;
  business_connection?: TgBusinessConnection;
}

export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  date: number;
  text?: string;
  voice?: TgVoice;
  audio?: TgAudio;
  photo?: TgPhoto[];
  video?: TgVideo;
  document?: TgDocument;
  sticker?: TgSticker;
  caption?: string;
  reply_to_message?: TgMessage;
  entities?: TgEntity[];
  business_connection_id?: string;
}

export interface TgUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TgChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TgVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TgAudio {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TgPhoto {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TgVideo {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TgDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TgSticker {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  is_animated: boolean;
  emoji?: string;
  set_name?: string;
}

export interface TgEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: TgUser;
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}

export interface TgBusinessConnection {
  id: string;
  user: TgUser;
  user_chat_id: number;
  date: number;
  can_reply: boolean;
  is_enabled: boolean;
}

export interface TgFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

export interface DBMessage {
  id: number;
  chat_id: string;
  user_id: string | null;
  user_name: string | null;
  role: string;
  content: string;
  media_type: string | null;
  media_file_id: string | null;
  caption: string | null;
  transcribed: number;
  transcription: string | null;
  source: string;
  created_at: string;
}

export interface DBPreference {
  id: number;
  user_id: string;
  pkey: string;
  pvalue: string;
  category: string;
  updated_at: string;
}

export interface DBReminder {
  id: number;
  user_id: string;
  chat_id: string;
  remind_text: string;
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

export interface DBBlocked {
  id: number;
  chat_id: string;
  user_id: string;
  blocked_by: string;
  created_at: string;
}

export interface DBQueueItem {
  id: number;
  command_type: string;
  chat_id: string | null;
  payload: string;
  status: string;
  result: string | null;
  error: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface GroqMsg {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
}

export interface GroqResp {
  id: string;
  choices: Array<{
    message: GroqMsg;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface Parsed {
  chatId: string;
  userId: string;
  userName: string;
  text: string;
  triggered: boolean;
  cleanText: string;
  hasVoice: boolean;
  hasPhoto: boolean;
  voiceFileId?: string;
  photoFileId?: string;
  isGroup: boolean;
  isOwner: boolean;
  raw: TgMessage;
  bizConnId?: string;
}

export interface LLMResponse {
  reply: string;
  actions?: LLMAction[];
}

export interface LLMAction {
  type: 'save_pref' | 'delete_pref' | 'set_reminder' | 'save_contact' | 'block_user' | 'unblock_user' | 'userbot_cmd' | 'change_mode';
  key?: string;
  value?: string;
  remind_at?: string;
  remind_text?: string;
  mode?: string;
  contact?: { telegram_id?: string; username?: string; first_name?: string; role?: string; nickname?: string; notes?: string };
  block_user_id?: string;
  userbot?: { type: string; chatId?: string | number; text?: string; messageId?: number; userId?: number; fromChatId?: string | number; toChatId?: string | number };
}
