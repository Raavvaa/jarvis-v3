const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const SECRET = process.env.WEBHOOK_SECRET;

if (!BOT_TOKEN || !WEBHOOK_URL) {
  console.error('Set TELEGRAM_BOT_TOKEN and WEBHOOK_URL');
  process.exit(1);
}

const body = {
  url: WEBHOOK_URL,
  allowed_updates: ['message', 'business_message', 'business_connection', 'callback_query'],
  max_connections: 40,
};
if (SECRET) body.secret_token = SECRET;

const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
console.log('setWebhook:', await res.json());

const info = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
console.log('info:', await info.json());
