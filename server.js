import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = process.env.PORT || 10000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_IDS = (process.env.TELEGRAM_CHAT_IDS || "")
  .split(",")
  .map(id => id.trim())
  .filter(Boolean);

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const recentRequests = new Map();

function tooManyRequests(req) {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";

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
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn("TELEGRAM_BOT_TOKEN is missing.");
    return { ok: false, error: "Telegram bot token missing" };
  }

  if (!TELEGRAM_CHAT_IDS.length) {
    console.warn("TELEGRAM_CHAT_IDS is empty.");
    return { ok: false, error: "Telegram chat IDs missing" };
  }

  const results = [];

  for (const chatId of TELEGRAM_CHAT_IDS) {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true
          })
        }
      );

      const body = await response.json().catch(() => ({}));
      const ok = response.ok && body.ok;

      results.push({ chatId, ok, body });

      if (!ok) {
        console.warn("Telegram send failed:", chatId, body);
      }
    } catch (error) {
      console.warn("Telegram request crashed:", chatId, error);
      results.push({ chatId, ok: false, error: error.message });
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
    `<b>Language:</b> ${escapeHtml(clean(data.language, 20)) || "Not given"}`,
    "",
    `<b>Page:</b> ${escapeHtml(clean(data.page, 400)) || "Not given"}`
  ].join("\n");
}

function registrationMessage(data) {
  return [
    "📝 <b>NEW COURSE REGISTRATION</b>",
    "",
    `<b>Name:</b> ${escapeHtml(clean(data.name, 120)) || "Not given"}`,
    `<b>Phone:</b> ${escapeHtml(clean(data.phone, 80)) || "Not given"}`,
    `<b>Telegram:</b> ${escapeHtml(clean(data.telegram, 120)) || "Not given"}`,
    `<b>Age:</b> ${escapeHtml(clean(data.age, 20)) || "Not given"}`,
    "",
    `<b>Course:</b> ${escapeHtml(clean(data.course, 120)) || "Not selected"}`,
    `<b>Level:</b> ${escapeHtml(clean(data.level, 120)) || "Not selected"}`,
    `<b>Preferred time:</b> ${escapeHtml(clean(data.preferredTime, 120)) || "Not selected"}`,
    `<b>Student type:</b> ${escapeHtml(clean(data.studentType, 120)) || "Not selected"}`,
    "",
    `<b>Comment:</b> ${escapeHtml(clean(data.comment, 600)) || "No comment"}`,
    "",
    `<b>Source:</b> ${escapeHtml(clean(data.source, 120)) || "Registration form"}`,
    `<b>Page:</b> ${escapeHtml(clean(data.page, 400)) || "Not given"}`
  ].join("\n");
}

function chatMessage(data) {
  return [
    "💬 <b>KEVIN’S ACADEMY HELP CHAT</b>",
    "",
    `<b>Name:</b> ${escapeHtml(clean(data.name, 120)) || "Not given"}`,
    `<b>Contact:</b> ${escapeHtml(clean(data.contact, 120)) || "Not given"}`,
    `<b>Language:</b> ${escapeHtml(clean(data.language, 20)) || "Not given"}`,
    "",
    "<b>Question:</b>",
    escapeHtml(clean(data.message, 1200)),
    "",
    `<b>Page:</b> ${escapeHtml(clean(data.page, 400)) || "Not given"}`
  ].join("\n");
}

function registerPage() {
  return `<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Kevin’s Academy | Registration</title>
  <style>
    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: Arial, sans-serif;
      color: #f7f1e5;
      background:
        radial-gradient(circle at top left, rgba(215,185,123,.16), transparent 34%),
        radial-gradient(circle at bottom right, rgba(60,130,255,.14), transparent 34%),
        linear-gradient(180deg, #060a12, #02040a);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 22px;
    }

    .card {
      width: 100%;
      max-width: 520px;
      border: 1px solid rgba(255,255,255,.12);
      background: rgba(16,26,42,.88);
      box-shadow: 0 30px 90px rgba(0,0,0,.45);
      padding: 28px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 22px;
    }

    .logo {
      width: 44px;
      height: 44px;
      border: 1px solid rgba(215,185,123,.65);
      display: grid;
      place-items: center;
      color: #f1d79d;
      font-family: Georgia, serif;
      font-size: 24px;
    }

    .brand strong {
      display: block;
      letter-spacing: .08em;
      font-family: Georgia, serif;
    }

    .brand small {
      color: #a8adba;
      font-size: 10px;
      letter-spacing: .18em;
    }

    h1 {
      margin: 0 0 8px;
      font-family: Georgia, serif;
      font-size: 34px;
      font-weight: 400;
      letter-spacing: -.04em;
    }

    p {
      margin: 0 0 22px;
      color: #b8bdc8;
      line-height: 1.6;
      font-size: 14px;
    }

    form {
      display: grid;
      gap: 12px;
    }

    label {
      display: grid;
      gap: 7px;
      color: #d8dbe2;
      font-size: 12px;
      font-weight: 700;
    }

    input, select, textarea {
      width: 100%;
      min-height: 50px;
      border: 1px solid rgba(255,255,255,.14);
      background: #090f1a;
      color: #f7f1e5;
      padding: 0 13px;
      outline: none;
      border-radius: 0;
    }

    textarea {
      padding-top: 12px;
      min-height: 90px;
      resize: vertical;
    }

    input:focus, select:focus, textarea:focus {
      border-color: #d7b97b;
      box-shadow: 0 0 0 3px rgba(215,185,123,.12);
    }

    option {
      background: #090f1a;
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    button {
      min-height: 54px;
      border: 1px solid rgba(215,185,123,.65);
      background: #d7b97b;
      color: #060a12;
      font-weight: 900;
      cursor: pointer;
      border-radius: 999px;
      margin-top: 6px;
    }

    button:disabled {
      opacity: .6;
      cursor: not-allowed;
    }

    .status {
      display: none;
      padding: 12px;
      border: 1px solid rgba(215,185,123,.35);
      background: rgba(215,185,123,.08);
      color: #f1d79d;
      font-size: 13px;
      line-height: 1.5;
    }

    .status.show { display: block; }

    .status.error {
      border-color: rgba(239,68,68,.4);
      background: rgba(239,68,68,.09);
      color: #fecaca;
    }

    .back {
      display: block;
      margin-top: 18px;
      text-align: center;
      color: #a8adba;
      font-size: 13px;
      text-decoration: none;
    }

    @media (max-width: 560px) {
      body { padding: 12px; align-items: flex-start; }
      .card { padding: 22px 16px; }
      .grid { grid-template-columns: 1fr; }
      h1 { font-size: 29px; }
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="brand">
      <div class="logo">K</div>
      <div>
        <strong>KEVIN’S ACADEMY</strong>
        <small>FERGANA · REGISTRATION</small>
      </div>
    </div>

    <h1>Kursga yozilish</h1>
    <p>Formani to‘ldiring. Arizangiz Kevin’s Academy administratorlariga Telegram orqali yuboriladi.</p>

    <form id="registrationForm">
      <label>
        Ism
        <input name="name" required placeholder="Ismingiz" autocomplete="name" />
      </label>

      <label>
        Telefon raqam
        <input name="phone" required placeholder="+998 90 123 45 67" autocomplete="tel" />
      </label>

      <label>
        Telegram username
        <input name="telegram" placeholder="@username" />
      </label>

      <div class="grid">
        <label>
          Yosh
          <input name="age" type="number" min="4" max="80" placeholder="18" />
        </label>

        <label>
          Kim uchun?
          <select name="studentType">
            <option>O‘zim uchun</option>
            <option>Farzandim uchun</option>
            <option>Do‘stim/yaqinim uchun</option>
          </select>
        </label>
      </div>

      <label>
        Kurs
        <select name="course" required>
          <option value="">Kursni tanlang</option>
          <option>General English</option>
          <option>IELTS Preparation</option>
          <option>English for Kids & Teens</option>
          <option>Speaking English</option>
          <option>Bilmayman, maslahat kerak</option>
        </select>
      </label>

      <div class="grid">
        <label>
          Daraja
          <select name="level">
            <option>Bilmayman</option>
            <option>Beginner</option>
            <option>Elementary</option>
            <option>Pre-Intermediate</option>
            <option>Intermediate</option>
            <option>Upper-Intermediate</option>
            <option>Advanced</option>
          </select>
        </label>

        <label>
          Qulay vaqt
          <select name="preferredTime">
            <option>Farqi yo‘q</option>
            <option>Ertalab</option>
            <option>Tushdan keyin</option>
            <option>Kechki payt</option>
            <option>Dam olish kunlari</option>
          </select>
        </label>
      </div>

      <label>
        Izoh
        <textarea name="comment" placeholder="Maqsadingiz, IELTS target yoki savolingiz..."></textarea>
      </label>

      <button type="submit" id="submitBtn">Ariza yuborish</button>
      <div class="status" id="status"></div>
    </form>

    <a class="back" href="/">Asosiy saytga qaytish</a>
  </main>

  <script>
    const form = document.getElementById("registrationForm");
    const statusBox = document.getElementById("status");
    const submitBtn = document.getElementById("submitBtn");

    function showStatus(text, error = false) {
      statusBox.textContent = text;
      statusBox.className = "status show" + (error ? " error" : "");
    }

    form.addEventListener("submit", async event => {
      event.preventDefault();

      const oldText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = "Yuborilmoqda...";

      const payload = Object.fromEntries(new FormData(form).entries());
      payload.source = "Instagram registration form";
      payload.page = window.location.href;
      payload.language = "uz";

      try {
        const response = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || "Request failed");
        }

        showStatus("Arizangiz yuborildi. Administrator tez orada siz bilan bog‘lanadi.");
        form.reset();
      } catch (error) {
        console.error(error);
        showStatus("Xatolik yuz berdi. Telegramga yuborilmadi. Administratorga yozing.", true);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = oldText;
      }
    });
  </script>
</body>
</html>`;
}

app.get("/api/version", (req, res) => {
  res.json({
    ok: true,
    version: "kevin-register-inline-2026-06-30",
    registerRoute: true
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    telegramConfigured: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_IDS.length),
    chatIds: TELEGRAM_CHAT_IDS.length,
    version: "kevin-register-inline-2026-06-30"
  });
});

app.get("/register", (req, res) => {
  res.type("html").send(registerPage());
});

app.get("/r", (req, res) => {
  res.type("html").send(registerPage());
});

app.get("/apply", (req, res) => {
  res.type("html").send(registerPage());
});

app.post("/api/register", async (req, res) => {
  try {
    if (tooManyRequests(req)) {
      return res.status(429).json({ error: "Too many requests." });
    }

    const data = req.body || {};

    const name = clean(data.name, 120);
    const phone = clean(data.phone, 80);
    const course = clean(data.course, 120);

    if (!name || !phone || !course) {
      return res.status(400).json({
        error: "Name, phone and course are required."
      });
    }

    const tg = await sendTelegram(registrationMessage(data));

    if (!tg.ok) {
      console.error("Telegram registration send failed:", tg);
      return res.status(500).json({
        error: "Telegram failed. Check bot token, chat IDs, and /start."
      });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("Registration route crashed:", error);
    res.status(500).json({ error: "Registration failed." });
  }
});

app.post("/api/lead", async (req, res) => {
  try {
    if (tooManyRequests(req)) {
      return res.status(429).json({ error: "Too many requests." });
    }

    const data = req.body || {};
    const name = clean(data.name, 120);
    const phone = clean(data.phone, 80);

    if (!name || !phone) {
      return res.status(400).json({ error: "Name and phone are required." });
    }

    const tg = await sendTelegram(consultationMessage(data));

    if (!tg.ok) {
      return res.status(500).json({
        error: "Telegram failed. Check bot token, chat IDs, and /start."
      });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("Lead route crashed:", error);
    res.status(500).json({ error: "Lead failed." });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    if (tooManyRequests(req)) {
      return res.status(429).json({ error: "Too many requests." });
    }

    const data = req.body || {};
    const message = clean(data.message, 1200);

    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }

    await sendTelegram(chatMessage(data));

    res.json({
      ok: true,
      reply:
        "Savolingiz administratorlarga yuborildi. Real odam javob berishi uchun telefon yoki Telegram qoldiring."
    });
  } catch (error) {
    console.error("Chat route crashed:", error);
    res.status(500).json({ error: "Chat failed." });
  }
});

app.use(express.static(PUBLIC_DIR));

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "API endpoint not found." });
  }

  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Kevin’s Academy lead server running on port ${PORT}`);
});
