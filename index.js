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
// ... your existing bot setup ...

// === Webhook setup for Railway / production ===
// Only run this in production (not locally)
const express = require("express");
const app = express();

// Parse JSON bodies from Telegram (required!)
app.use(express.json());

// Let Telegraf handle POST requests at /webhook
app.use(bot.webhookCallback("/webhook"));

// Optional: health check (open in browser to confirm server is up)
app.get("/", (req, res) => {
  res.send("Bot webhook server is alive");
});

const PORT = process.env.PORT || 3000;

// === Choose webhook mode ===
let webhookUrl = null;

if (process.env.NODE_ENV === "production") {
  // Railway / production: use the auto-generated domain
  webhookUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/webhook`;
} else if (process.env.NGROK_URL) {
  // Local dev with ngrok
  webhookUrl = `${process.env.NGROK_URL}/webhook`;
}

if (webhookUrl) {
  console.log(`Starting webhook server – URL: ${webhookUrl}`);

  // Set the webhook (only needed once, but safe to call again)
  bot.telegram
    .setWebhook(webhookUrl)
    .then(() => {
      console.log(`Webhook successfully set to: ${webhookUrl}`);
    })
    .catch((err) => {
      console.error("Failed to set webhook:", err.message);
    });

  app.listen(PORT, () => {
    console.log(`Webhook server listening on port ${PORT}`);
  });
} else {
  // No webhook URL → exit with clear message
  console.log("==================================================================");
  console.log("No webhook URL detected.");
  console.log("For local development:");
  console.log("1. Run ngrok http 3000");
  console.log("2. Set env var: NGROK_URL=https://xxxx.ngrok-free.app");
  console.log("3. Then run: NGROK_URL=... node index.js");
  console.log("==================================================================");
  process.exit(1);
}
// Graceful shutdown
process.once("SIGINT", () => {
  bot.stop("SIGINT");
  logger.info("Bot stopped (SIGINT)");
});

process.once("SIGTERM", () => {
  bot.stop("SIGTERM");
  logger.info("Bot stopped (SIGTERM)");
});
