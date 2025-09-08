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

// === Временное хранилище (в памяти) ===
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

// === Команды ===
bot.start((ctx) => {
  const id = ctx.from.id;
  if (!users[id]) {
    users[id] = { startDate: null, takenToday: [], active: false };
  }
  ctx.reply(
    "👋 Привет! Я помогу тебе пить таблетки по схеме.\n\n" +
      "➡️ Нажимай кнопку *Новый день*, когда проснёшься и начнёшь новый день лечения.\n\n" +
      "Пока ты не начнёшь новый день — напоминаний не будет.",
    {
      parse_mode: "Markdown",
      reply_markup: Markup.inlineKeyboard([
        Markup.button.callback("🌅 Новый день", "new_day"),
        Markup.button.callback("💊 Выпил", "taken"),
      ]),
    }
  );
});

// Запуск нового дня
bot.action("new_day", (ctx) => {
  const id = ctx.from.id;
  users[id] = {
    startDate: new Date().toISOString(),
    takenToday: [],
    active: true,
  };
  ctx.reply("✅ Новый день начался! Я буду напоминать по схеме.");
});

// Отметить таблетку
bot.action("taken", (ctx) => {
  const id = ctx.from.id;
  if (!users[id]) {
    users[id] = { startDate: null, takenToday: [], active: false };
  }
  if (!users[id].active) {
    return ctx.reply("⚠️ Сначала начни новый день кнопкой *Новый день*.");
  }
  users[id].takenToday.push(new Date().toISOString());
  ctx.editMessageText("✅ Таблетка отмечена как выпитая!");
});

// Ввод количества таблеток вручную
bot.command("set", (ctx) => {
  const id = ctx.from.id;
  const args = ctx.message.text.split(" ");
  if (args.length < 2 || isNaN(args[1])) {
    return ctx.reply(
      "⚠️ Используй команду так: `/set 3` (где 3 — количество таблеток)",
      {
        parse_mode: "Markdown",
      }
    );
  }
  const count = parseInt(args[1]);
  if (!users[id]) {
    users[id] = { startDate: null, takenToday: [], active: false };
  }
  // заменяем массив на нужное количество записей
  users[id].takenToday = Array(count).fill(new Date().toISOString());
  ctx.reply(`✅ Установлено: ${count} таблеток за сегодня.`);
});

// Команда показать прогресс
bot.command("progress", (ctx) => {
  const id = ctx.from.id;
  if (!users[id] || !users[id].active) {
    return ctx.reply("ℹ️ Ты ещё не начал новый день.");
  }
  const now = new Date();
  const diffDays =
    Math.floor((now - new Date(users[id].startDate)) / (1000 * 60 * 60 * 24)) +
    1;
  const plan = getPlan(diffDays);
  if (!plan) return ctx.reply("✅ Курс завершён!");

  const taken = users[id].takenToday.filter(
    (d) => new Date(d).toDateString() === now.toDateString()
  ).length;

  ctx.reply(
    `📅 День ${diffDays}\n` +
      `💊 Выпито: ${taken}/${plan.times}\n` +
      `⏳ Интервал: каждые ${plan.interval} ч.`
  );
});

// Крон — каждый час проверяем напоминания
cron.schedule("0 * * * *", () => {
  const now = new Date();

  for (const [id, user] of Object.entries(users)) {
    if (!user.active) continue; // если день не начат, не шлём напоминания

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

bot.launch();
