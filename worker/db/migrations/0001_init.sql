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
    source TEXT NOT NULL DEFAULT 'bot',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_msg_chat ON messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_msg_media ON messages(chat_id, media_type, transcribed);

CREATE TABLE IF NOT EXISTS preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    pkey TEXT NOT NULL,
    pvalue TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, pkey)
);
CREATE INDEX IF NOT EXISTS idx_pref_user ON preferences(user_id);

CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    remind_text TEXT NOT NULL,
    remind_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    sent INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'bot'
);
CREATE INDEX IF NOT EXISTS idx_rem_pending ON reminders(sent, remind_at);

CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    role TEXT,
    nickname TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(telegram_id)
);
CREATE INDEX IF NOT EXISTS idx_contact_uname ON contacts(username);

CREATE TABLE IF NOT EXISTS blocked_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    blocked_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(chat_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_blocked ON blocked_users(chat_id, user_id);

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
CREATE INDEX IF NOT EXISTS idx_log_time ON request_logs(created_at);
