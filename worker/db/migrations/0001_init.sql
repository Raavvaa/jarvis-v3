-- ============================================
-- Базовые таблицы (из v2)
-- ============================================

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    user_id TEXT,
    user_name TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    content TEXT NOT NULL DEFAULT '',
    media_type TEXT,
    media_file_id TEXT,
    caption TEXT,
    transcribed INTEGER NOT NULL DEFAULT 0,
    transcription TEXT,
    raw_data TEXT,
    source TEXT NOT NULL DEFAULT 'bot',        -- 'bot' | 'userbot'
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_media ON messages(chat_id, media_type, transcribed);

CREATE TABLE IF NOT EXISTS preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_preferences_user ON preferences(user_id);

CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    text TEXT NOT NULL,
    remind_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    sent INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'bot'
);

CREATE INDEX IF NOT EXISTS idx_reminders_pending ON reminders(sent, remind_at);

CREATE TABLE IF NOT EXISTS chat_modes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL UNIQUE,
    mode TEXT NOT NULL DEFAULT 'default',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS request_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT,
    user_id TEXT,
    model TEXT,
    tokens_in INTEGER DEFAULT 0,
    tokens_out INTEGER DEFAULT 0,
    latency_ms INTEGER DEFAULT 0,
    source TEXT DEFAULT 'bot',
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_logs_created ON request_logs(created_at);
