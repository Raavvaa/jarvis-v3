-- ============================================
-- Таблицы для юзербота
-- ============================================

-- Очередь команд от Worker к юзерботу
CREATE TABLE IF NOT EXISTS command_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    command_type TEXT NOT NULL,       -- 'send_message', 'delete_message', 'create_group', etc.
    chat_id TEXT,
    payload TEXT NOT NULL,            -- JSON с параметрами
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'processing', 'done', 'error'
    result TEXT,                      -- JSON с результатом
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_queue_status ON command_queue(status, created_at);

-- Контакты (информация о людях)
CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    role TEXT,                         -- 'girlfriend', 'friend', 'colleague', 'family', 'boss'
    nickname TEXT,                     -- как хозяин их называет
    notes TEXT,                        -- доп. заметки
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(telegram_id)
);

CREATE INDEX IF NOT EXISTS idx_contacts_username ON contacts(username);

-- Настройки чатов для юзербота
CREATE TABLE IF NOT EXISTS chat_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL UNIQUE,
    chat_title TEXT,
    is_silent INTEGER NOT NULL DEFAULT 0,   -- юзербот молчит
    is_active INTEGER NOT NULL DEFAULT 1,   -- юзербот активен
    ignore_users TEXT,                       -- JSON массив user_id для игнора
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_settings_chat ON chat_settings(chat_id);

-- Лог команд юзербота (аудит)
CREATE TABLE IF NOT EXISTS userbot_action_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_type TEXT NOT NULL,
    chat_id TEXT,
    details TEXT,                     -- JSON
    success INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_action_log_created ON userbot_action_log(created_at);
