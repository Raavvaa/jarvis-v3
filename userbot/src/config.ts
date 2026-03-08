import 'dotenv/config';

export const CFG = {
  apiId: parseInt(process.env.API_ID || '0', 10),
  apiHash: process.env.API_HASH || '',
  session: process.env.SESSION_STRING || '',
  myId: process.env.MY_TELEGRAM_ID || '',
  workerUrl: process.env.WORKER_URL || '',
  workerSecret: process.env.WORKER_API_SECRET || '',
  tz: parseInt(process.env.TIMEZONE_OFFSET || '3', 10),
};

if (!CFG.apiId || !CFG.apiHash) {
  console.error('❌ API_ID and API_HASH required. Get at https://my.telegram.org');
  process.exit(1);
}
if (!CFG.workerUrl || !CFG.workerSecret) {
  console.error('❌ WORKER_URL and WORKER_API_SECRET required.');
  process.exit(1);
}
