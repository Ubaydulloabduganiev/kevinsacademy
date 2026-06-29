# Kevin’s Academy Telegram + Help Chat Website

This package contains:

- `public/index.html` - the updated Kevin’s Academy landing page
- `server.js` - backend for Telegram leads and optional OpenAI help chat
- `package.json` - Node dependencies
- `.env.example` - environment variables
- `render.yaml` - Render blueprint

## What was added

- Results/statistics section:
  - 8+ years working
  - 5000+ students taught
  - 150+ IELTS 8.0+
  - 300+ IELTS 7.5
  - 500+ IELTS 7.0
  - Speaking 9.0 student studied there
- Contact form sends leads to Telegram
- Bottom-right help chat widget
- Help chat forwards questions to Telegram
- Optional OpenAI-powered answers

## Telegram setup

1. Create a Telegram bot using BotFather.
2. Copy the bot token.
3. Both Telegram accounts with these IDs must open the bot and press Start:
   - 8584718189
   - 8727767463
4. Add this environment variable:

TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_IDS=8584718189,8727767463

Important: a bot usually cannot message a private user who has never started the bot.

## OpenAI chat setup

By default, AI chat is off. To enable it:

USE_OPENAI_CHAT=true
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-5.5

The API key must stay on the backend. Do not paste it into frontend HTML.

## Render deployment

Build command:

npm install

Start command:

npm start

## Static hosting option

If you keep `index.html` on GitHub Pages and deploy only `server.js` on Render, set this in the HTML:

window.KEVIN_API_BASE = "https://your-render-app.onrender.com";

Place it before the main script or edit:

const KEVIN_API_BASE = window.KEVIN_API_BASE || "";

The easier option is to deploy the whole package on Render and connect a domain/subdomain.
