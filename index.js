import { Telegraf, Markup } from "telegraf";
import cron from "node-cron";
import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.status(200).json({ status: "OK" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

const bot = new Telegraf(process.env.BOT_TOKEN);

// === Временное хранилище в памяти (для демо) ===
let users = {};

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
    users[id] = { startDate: new Date().toISOString(), takenToday: [] };
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
  if (!users[id])
    users[id] = { startDate: new Date().toISOString(), takenToday: [] };

  users[id].takenToday.push(new Date().toISOString());

  ctx.editMessageText("✅ Таблетка отмечена как выпитая!");
});

bot.launch();
