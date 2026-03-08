import 'dotenv/config';

export const CONFIG = {
  apiId: parseInt(process.env.API_ID || '0', 10),
  apiHash: process.env.API_HASH || '',
  sessionString: process.env.SESSION_STRING || '',
  myTelegramId: process.env.MY_TELEGRAM_ID || '',
  workerUrl: process.env.WORKER_URL || '',
  workerApiSecret: process.env.WORKER_API_SECRET || '',
  timezoneOffset: parseInt(process.env.TIMEZONE_OFFSET || '3', 10),
};

if (!CONFIG.apiId || !CONFIG.apiHash) {
  console.error('❌ API_ID and API_HASH are required!');
  console.error('   Get them at https://my.telegram.org');
  process.exit(1);
}

if (!CONFIG.workerUrl || !CONFIG.workerApiSecret) {
  console.error('❌ WORKER_URL and WORKER_API_SECRET are required!');
  process.exit(1);
}

// Триггеры
export const TRIGGER_WORDS = ['джарвис', 'jarvis', 'бро', 'братан'];
export const TRIGGER_COMMANDS = ['/j ', '/ask '];
