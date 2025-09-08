import { Telegraf } from "telegraf";
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

// === Временное хранилище в памяти ===
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

// === Кнопочная клавиатура ===
const mainKeyboard = {
  reply_markup: {
    keyboard: [["🌅 Новый день", "💊 Выпил"], ["📊 Прогресс"]],
    resize_keyboard: true,
    one_time_keyboard: false,
  },
};

// === Команды ===
bot.start((ctx) => {
  const id = ctx.from.id;
  if (!users[id]) {
    users[id] = { startDate: null, takenToday: [], active: false };
  }
  ctx.reply(
    "👋 Привет! Я помогу тебе пить таблетки по схеме.\n\n" +
      "➡️ Нажимай *Новый день*, когда проснёшься.\n" +
      "➡️ Отмечай *Выпил*, чтобы фиксировать таблетки.\n" +
      "➡️ Команда /set N — вручную указать количество.\n",
    { parse_mode: "Markdown", ...mainKeyboard }
  );
});

// Новый день
bot.hears("🌅 Новый день", (ctx) => {
  const id = ctx.from.id;
  users[id] = {
    startDate: new Date().toISOString(),
    takenToday: [],
    active: true,
  };
  ctx.reply("✅ Новый день начался! Я буду напоминать по схеме.", mainKeyboard);
});

// Отметить таблетку
bot.hears("💊 Выпил", (ctx) => {
  const id = ctx.from.id;
  if (!users[id] || !users[id].active) {
    return ctx.reply(
      "⚠️ Сначала начни новый день кнопкой 🌅 Новый день.",
      mainKeyboard
    );
  }
  users[id].takenToday.push(new Date().toISOString());
  ctx.reply("✅ Таблетка отмечена как выпитая!", mainKeyboard);
});

// Прогресс
bot.hears("📊 Прогресс", (ctx) => {
  const id = ctx.from.id;
  if (!users[id] || !users[id].active) {
    return ctx.reply("ℹ️ Ты ещё не начал новый день.", mainKeyboard);
  }
  const now = new Date();
  const diffDays =
    Math.floor((now - new Date(users[id].startDate)) / (1000 * 60 * 60 * 24)) +
    1;
  const plan = getPlan(diffDays);
  if (!plan) return ctx.reply("✅ Курс завершён!", mainKeyboard);

  const taken = users[id].takenToday.filter(
    (d) => new Date(d).toDateString() === now.toDateString()
  ).length;

  ctx.reply(
    `📅 День ${diffDays}\n` +
      `💊 Выпито: ${taken}/${plan.times}\n` +
      `⏳ Интервал: каждые ${plan.interval} ч.`,
    mainKeyboard
  );
});

// Установить количество таблеток вручную
bot.command("set", (ctx) => {
  const id = ctx.from.id;
  const args = ctx.message.text.split(" ");
  if (args.length < 2 || isNaN(args[1])) {
    return ctx.reply(
      "⚠️ Используй команду так: `/set 3` (где 3 — количество таблеток)",
      {
        parse_mode: "Markdown",
        ...mainKeyboard,
      }
    );
  }
  const count = parseInt(args[1]);
  if (!users[id]) {
    users[id] = { startDate: null, takenToday: [], active: false };
  }
  users[id].takenToday = Array(count).fill(new Date().toISOString());
  ctx.reply(`✅ Установлено: ${count} таблеток за сегодня.`, mainKeyboard);
});

// === Крон — каждый час проверяем напоминания ===
cron.schedule("0 * * * *", () => {
  const now = new Date();

  for (const [id, user] of Object.entries(users)) {
    if (!user.active) continue; // день не начат — не напоминаем

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
          mainKeyboard
        )
        .catch((error) => {
          console.error(`Ошибка отправки сообщения пользователю ${id}:`, error);
        });
    }
  }
});

bot.launch();
