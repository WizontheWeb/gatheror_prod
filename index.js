// index.js
require("dotenv").config();
const config = require("./config/env");
const logger = require("./config/logger");
const bot = require("./bot");

// ── Set custom commands menu (only /newpost visible) ────────────────────────
async function setBotCommands() {
  try {
    await bot.telegram.deleteMyCommands();
  } catch (err) {
    logger.error("Failed todelete:", err);
  }
  try {
    await bot.telegram.setMyCommands([
      {
        command: "newpost",
        description: "Create a new post on the website",
      },
      // Add more commands here in the future if needed, e.g.:
      // { command: 'help', description: 'Show help' }
    ]);

    logger.info("Bot commands menu successfully set: only /newpost visible");
  } catch (err) {
    logger.error("Failed to set bot commands menu:", err);
  }
}

// Call it once when bot starts
setBotCommands();

// ── Webhook configuration ────────────────────────────────────────────────
const publicUrl = process.env.NGROK_URL || `http://localhost:${config.PORT}`;

if (!publicUrl.startsWith("https://")) {
  logger.warn("Webhook URL should use HTTPS (Telegram requirement).");
}

const secretPath = `/telegraf/${config.TOKEN.split(":")[1] || "secret"}`;

const webhookOptions = {
  domain: publicUrl,
  hookPath: secretPath,
  port: config.PORT,
};

// Launch
logger.info(`Starting bot in webhook mode`);
logger.info(`Webhook URL: ${publicUrl}${secretPath}`);

bot
  .launch({
    webhook: webhookOptions,
  })
  .then(() => {
    logger.info("Webhook successfully set and bot is running!");
  })
  .catch((err) => {
    logger.error("Failed to launch webhook:", err);
    process.exit(1);
  });

// Graceful shutdown
process.once("SIGINT", () => {
  bot.stop("SIGINT");
  logger.info("Bot stopped (SIGINT)");
});

process.once("SIGTERM", () => {
  bot.stop("SIGTERM");
  logger.info("Bot stopped (SIGTERM)");
});
