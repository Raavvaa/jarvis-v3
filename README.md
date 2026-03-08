# 🤖 JARVIS v4

Personal Telegram AI assistant. Two components working together:
- **Cloudflare Worker** — public bot + API + cron reminders
- **GramJS Userbot** — MTProto client running on VPS, acts as owner's hands

## Architecture

```
Owner's Telegram ←→ Userbot (MTProto on VPS)
                         ↕ REST API
                    Worker (Cloudflare)
                         ↕
                    D1 + Groq + Whisper

Group users ←→ Bot (Bot API via Worker webhook)
```

## Deployment

### Step 1: Worker

```bash
cd worker
npm install

# Secrets
wrangler secret put TELEGRAM_BOT_TOKEN
# paste: 8702050569:AAF6QR1FYs0xzLIbS3ZvFi956i839NFvic8

wrangler secret put GROQ_API_KEY
# paste: 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

wrangler secret put GROQ_API_KEY_2
# paste: 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

wrangler secret put WEBHOOK_SECRET
# paste: mySecret123

wrangler secret put MY_TELEGRAM_ID
# paste: 1344488824

wrangler secret put WORKER_API_SECRET
# paste: workerApiKey456

# Database migrations
wrangler d1 migrations apply jarvis-db

# Deploy
npm run deploy
```

### Step 2: Set webhook

```bash
# Option A: browser
# Open: https://jarvis-worker.loxazavr.workers.dev/setup

# Option B: script
cd scripts
node set-webhook.mjs
```

### Step 3: Verify worker

```bash
# Health check
curl https://jarvis-worker.loxazavr.workers.dev/health
# Should return: {"status":"alive","db":true,"v":"4.0.0",...}

# Test bot: message @jarvis_rava_bot in Telegram
```

### Step 4: Userbot (on VPS)

```bash
# SSH into your VPS (Ubuntu 22.04)
ssh user@your-vps

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
sudo npm install -g pm2

# Clone or copy project
cd ~
mkdir jarvis && cd jarvis
# copy userbot/ directory here

cd userbot
npm install

# Create .env
cat > .env << 'EOF'
API_ID=29577387
API_HASH=f3e3df17463fe477c313121ce72cebc7
SESSION_STRING=
MY_TELEGRAM_ID=1344488824
WORKER_URL=https://jarvis-worker.loxazavr.workers.dev
WORKER_API_SECRET=workerApiKey456
TIMEZONE_OFFSET=3
GROQ_API_KEY=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
GROQ_API_KEY_2=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
EOF

# Authorize (one time only!)
npx tsx src/auth.ts
# Enter phone, code, 2FA password
# Copy the SESSION_STRING output
# Paste it into .env

# Build
npm run build

# Start with PM2
pm2 start dist/index.js --name jarvis-userbot
pm2 save
pm2 startup
# Follow the command PM2 outputs

# Check logs
pm2 logs jarvis-userbot

# Restart after changes
pm2 restart jarvis-userbot
```

### Step 5: Verify everything

1. **Public bot test**: Send "@jarvis_rava_bot привет" in any group
   - Bot should respond via Bot API

2. **Owner private test**: Send "Привет" to the bot in DM
   - Bot should respond as "сэр"

3. **Userbot test**: In your Saved Messages, type "Привет, Джарвис"
   - Should get response from your own account

4. **Reminder test**: "Напомни через 2 минуты тест"
   - Should get reminder in 2 minutes

5. **Memory test**: "Запомни что моя девушка Аня"
   - Then "что ты помнишь" — should show it

## Commands

### Owner (private chat, no trigger needed)
```
привет                          → general chat
запомни имя = Равиль            → saves preference
забудь имя                      → deletes preference  
что ты помнишь                  → lists all prefs
напомни в 15:00 позвонить маме  → sets reminder
напомни через 30 минут обед     → relative reminder
запиши в избранное купить молоко → saves to Saved Messages
не отвечай @spammer             → blocks user
/contacts                       → list contacts
/reminders                      → list reminders
/stats                          → usage stats
```

### Owner in groups (trigger required)
```
Джарвис, что думаешь?
Бро, переведи это на английский
/j расскажи анекдот
```

### Other users in groups (trigger required)
```
@jarvis_rava_bot что такое AI?
/ask расскажи про Python
Джарвис, помоги с задачей
```

## Security Notes

- SESSION_STRING = full account access. Never share!
- WORKER_API_SECRET protects all /api/ endpoints
- WEBHOOK_SECRET verifies Telegram webhook authenticity
- Bot never reveals owner's personal data to others
- Blocked users are silently ignored

## Limits (Free Tier)

| Service | Limit | Our Usage |
|---------|-------|-----------|
| Workers | 100K req/day | ~5-10K |
| D1 reads | 5M/day | ~50K |
| D1 writes | 100K/day | ~5K |
| Workers AI | 10K neurons/day | ~2K |
| Groq | 14.4K req/day | ~500 |

## Troubleshooting

**Bot doesn't respond:**
```bash
# Check webhook
curl https://api.telegram.org/bot8702050569:AAF6QR1FYs0xzLIbS3ZvFi956i839NFvic8/getWebhookInfo

# Check worker logs
cd worker && wrangler tail
```

**Userbot crashes:**
```bash
pm2 logs jarvis-userbot --lines 50
pm2 restart jarvis-userbot
```

**Rate limited by Groq:**
- Automatic fallback to secondary key + model
- Exponential backoff on retries
- Check /stats for usage
