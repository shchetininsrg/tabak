import { Telegraf, Markup } from "telegraf";
import cron from "node-cron";
import fs from "fs";
import express from "express";

// === Express app для обработки портов ===
const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get("/", (req, res) => {
  res.status(200).json({ status: "OK", message: "Bot is running" });
});

// Health check для Render
app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy" });
});

// Запускаем Express сервер
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
});

// === Инициализация бота ===
const bot = new Telegraf(process.env.BOT_TOKEN);

// === Работа с базой (JSON) ===
const DB_FILE = "./users.json";

// загружаем пользователей
let users = {};
if (fs.existsSync(DB_FILE)) {
  try {
    users = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  } catch (e) {
    console.error("Ошибка чтения users.json:", e);
  }
}

// сохраняем пользователей
function saveUsers() {
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

// === Логика схемы ===
function getPlan(day) {
  if (day <= 3) return { times: 6, interval: 2 };
  if (day <= 12) return { times: 5, interval: 2.5 };
  if (day <= 16) return { times: 4, interval: 3 };
  if (day <= 20) return { times: 3, interval: 5 };
  if (day <= 25) return { times: 2, interval: 12 };
  return null;
}

// === Команды бота ===
bot.start((ctx) => {
  const id = ctx.from.id;
  if (!users[id]) {
    users[id] = { startDate: new Date(), takenToday: [] };
    saveUsers();
    ctx.reply(
      "👋 Привет! Я буду напоминать тебе пить таблетки по схеме. Сегодня день 1."
    );
  } else {
    ctx.reply("✅ Ты уже начал курс. Я продолжаю отслеживать твой прогресс.");
  }
});

// каждый час проверяем напоминания
cron.schedule("0 * * * *", () => {
  const now = new Date();

  for (const [id, user] of Object.entries(users)) {
    const diffDays =
      Math.floor((now - new Date(user.startDate)) / (1000 * 60 * 60 * 24)) + 1;
    const plan = getPlan(diffDays);
    if (!plan) continue;

    const takenToday = user.takenToday.filter(
      (d) => new Date(d).toDateString() === now.toDateString()
    ).length;

    if (takenToday < plan.times) {
      bot.telegram
        .sendMessage(
          id,
          `💊 Пора принять таблетку! (${takenToday + 1}/${plan.times})`,
          {
            reply_markup: Markup.inlineKeyboard([
              Markup.button.callback("✅ Выпил", "taken"),
            ]),
          }
        )
        .catch((error) => {
          console.error(`Ошибка отправки сообщения пользователю ${id}:`, error);
        });
    }
  }
});

bot.action("taken", (ctx) => {
  const id = ctx.from.id;
  if (!users[id]) users[id] = { startDate: new Date(), takenToday: [] };

  users[id].takenToday.push(new Date());
  saveUsers();

  ctx.editMessageText("✅ Таблетка отмечена как выпитая!");
});

// Обработка ошибок бота
bot.catch((err, ctx) => {
  console.error(`Ошибка для пользователя ${ctx.from?.id}:`, err);
});

// Запуск бота с обработкой ошибок
bot
  .launch()
  .then(() => {
    console.log("Bot started successfully");
  })
  .catch((error) => {
    console.error("Failed to start bot:", error);
    process.exit(1);
  });

// Graceful shutdown
process.once("SIGINT", () => {
  bot.stop("SIGINT");
  process.exit(0);
});

process.once("SIGTERM", () => {
  bot.stop("SIGTERM");
  process.exit(0);
});
