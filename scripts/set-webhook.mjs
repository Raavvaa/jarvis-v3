const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8702050569:AAF6QR1FYs0xzLIbS3ZvFi956i839NFvic8';
const URL = process.env.WEBHOOK_URL || 'https://jarvis-worker.loxazavr.workers.dev/webhook';
const SECRET = process.env.WEBHOOK_SECRET || 'mySecret123';

const body = {
  url: URL,
  allowed_updates: ['message', 'business_message', 'business_connection', 'callback_query'],
  max_connections: 40,
  secret_token: SECRET,
};

const res = await fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
console.log('setWebhook:', await res.json());

const info = await fetch(`https://api.telegram.org/bot${TOKEN}/getWebhookInfo`);
console.log('info:', await info.json());
