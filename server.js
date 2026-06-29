import express from "express";

const app = express();
const PORT = process.env.PORT || 10000;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_IDS = (process.env.TELEGRAM_CHAT_IDS || "")
  .split(",")
  .map(id => id.trim())
  .filter(Boolean);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.5";
const USE_OPENAI_CHAT = String(process.env.USE_OPENAI_CHAT || "false").toLowerCase() === "true";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.static("public"));

const recentRequests = new Map();

function tooManyRequests(req) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const windowMs = 60_000;
  const max = 12;

  const item = recentRequests.get(ip) || { count: 0, started: now };
  if (now - item.started > windowMs) {
    recentRequests.set(ip, { count: 1, started: now });
    return false;
  }

  item.count += 1;
  recentRequests.set(ip, item);
  return item.count > max;
}

function clean(value, max = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn("TELEGRAM_BOT_TOKEN is missing. Message not sent.");
    return { ok: false, error: "Telegram bot token missing" };
  }

  if (!TELEGRAM_CHAT_IDS.length) {
    console.warn("TELEGRAM_CHAT_IDS is empty. Message not sent.");
    return { ok: false, error: "Telegram chat IDs missing" };
  }

  const results = [];

  for (const chatId of TELEGRAM_CHAT_IDS) {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true
      })
    });

    const body = await response.json().catch(() => ({}));
    results.push({ chatId, ok: response.ok && body.ok, body });

    if (!response.ok || !body.ok) {
      console.warn("Telegram send failed:", chatId, body);
    }
  }

  return { ok: results.some(r => r.ok), results };
}

function consultationMessage(data) {
  return [
    "🔥 <b>NEW KEVIN’S ACADEMY LEAD</b>",
    "",
    `<b>Name:</b> ${escapeHtml(clean(data.name, 120)) || "Not given"}`,
    `<b>Phone:</b> ${escapeHtml(clean(data.phone, 80)) || "Not given"}`,
    `<b>Age:</b> ${escapeHtml(clean(data.age, 20)) || "Not given"}`,
    `<b>Course:</b> ${escapeHtml(clean(data.course, 120)) || "Not selected"}`,
    `<b>Level:</b> ${escapeHtml(clean(data.level, 120)) || "Not selected"}`,
    `<b>Language:</b> ${escapeHtml(clean(data.language, 20))}`,
    "",
    `<b>Page:</b> ${escapeHtml(clean(data.page, 400))}`,
    "",
    "The website did its job. Humanity may continue."
  ].join("\n");
}

function chatMessage(data) {
  return [
    "💬 <b>KEVIN’S ACADEMY HELP CHAT</b>",
    "",
    `<b>Name:</b> ${escapeHtml(clean(data.name, 120)) || "Not given"}`,
    `<b>Contact:</b> ${escapeHtml(clean(data.contact, 120)) || "Not given"}`,
    `<b>Language:</b> ${escapeHtml(clean(data.language, 20))}`,
    "",
    `<b>Question:</b>`,
    escapeHtml(clean(data.message, 1200)),
    "",
    `<b>Page:</b> ${escapeHtml(clean(data.page, 400))}`
  ].join("\n");
}

async function askOpenAI({ language, message }) {
  if (!USE_OPENAI_CHAT || !OPENAI_API_KEY) return null;

  const system = language === "ru"
    ? "Ты помощник Kevin’s Academy в Фергане. Отвечай коротко, дружелюбно и профессионально. Если вопрос требует точных цен, расписания, адреса или свободных мест, скажи, что администратор свяжется и попроси оставить телефон или Telegram."
    : "Sen Farg‘onadagi Kevin’s Academy yordamchisisan. Qisqa, samimiy va professional javob ber. Agar savol aniq narx, jadval, manzil yoki joylar haqida bo‘lsa, administrator bog‘lanishini ayt va telefon yoki Telegram qoldirishni so‘ra.";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions: system,
      input: clean(message, 1200)
    })
  });

  if (!response.ok) {
    const text = await response.text();
    console.warn("OpenAI request failed:", text);
    return null;
  }

  const data = await response.json();
  return data.output_text || data.output?.[0]?.content?.[0]?.text || null;
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    telegramConfigured: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_IDS.length),
    openaiConfigured: Boolean(USE_OPENAI_CHAT && OPENAI_API_KEY),
    chatIds: TELEGRAM_CHAT_IDS.length
  });
});

app.post("/api/lead", async (req, res) => {
  if (tooManyRequests(req)) return res.status(429).json({ error: "Too many requests. Calm down, internet." });

  const data = req.body || {};
  const name = clean(data.name, 120);
  const phone = clean(data.phone, 80);

  if (!name || !phone) {
    return res.status(400).json({ error: "Name and phone are required." });
  }

  const tg = await sendTelegram(consultationMessage(data));

  if (!tg.ok) {
    return res.status(500).json({ error: "Telegram is not configured or the bot cannot message these chat IDs yet." });
  }

  res.json({ ok: true });
});

app.post("/api/chat", async (req, res) => {
  if (tooManyRequests(req)) return res.status(429).json({ error: "Too many requests." });

  const data = req.body || {};
  const message = clean(data.message, 1200);
  const language = clean(data.language, 20) || "uz";

  if (!message) {
    return res.status(400).json({ error: "Message is required." });
  }

  sendTelegram(chatMessage(data)).catch(error => console.warn("Telegram chat send failed:", error));

  let reply = null;

  try {
    reply = await askOpenAI({ language, message });
  } catch (error) {
    console.warn("OpenAI chat failed:", error);
  }

  if (!reply) {
    reply = language === "ru"
      ? "Ваш вопрос отправлен администраторам. Оставьте телефон или Telegram, чтобы реальный человек мог ответить."
      : "Savolingiz administratorlarga yuborildi. Real odam javob berishi uchun telefon yoki Telegram qoldiring.";
  }

  res.json({ ok: true, reply });
});

app.get("*", (req, res) => {
  res.sendFile(process.cwd() + "/public/index.html");
});

app.listen(PORT, () => {
  console.log(`Kevin’s Academy lead server running on port ${PORT}`);
});
