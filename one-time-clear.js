// one-time-clear.js (run once with node one-time-clear.js)
require("dotenv").config();
const { Telegraf } = require("telegraf");

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

bot.telegram
  .setMyCommands([{ command: "newpost", description: "Create a new post on the website" }])
  .then(() => {
    console.log("Commands menu updated – only /newpost visible");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error setting commands:", err);
    process.exit(1);
  });
