require("dotenv").config();
const logger = require("./logger");

const config = {
  TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  AUTHORIZED_IDS: process.env.TELEGRAM_AUTHORIZED_USER_IDS
    ? process.env.TELEGRAM_AUTHORIZED_USER_IDS.split(",")
        .map((id) => Number(id.trim()))
        .filter((id) => !isNaN(id) && id > 0)
    : [],

  WP_URL: process.env.WP_SITE_URL?.replace(/\/$/, ""),
  WP_USER: process.env.WP_USERNAME,
  WP_APP_PASS: process.env.WP_APPLICATION_PASSWORD,
  WP_POST_TYPE: process.env.WP_POST_TYPE || "post",
  WP_STATUS: process.env.WP_POST_STATUS || "publish",

  MAX_IMG_MB: Number(process.env.MAX_IMAGE_SIZE_MB) || 2,
  PORT: Number(process.env.PORT) || 3000,

  // ── NEW: Multi-user support ──────────────────────────────────────────────
  SUPERUSER_ID: process.env.SUPERUSER_ID ? Number(process.env.SUPERUSER_ID) : null,
  MAX_NUM_USERS: Number(process.env.MAX_NUM_USERS) || 10, // default 10 ordinary users
};

if (!config.TOKEN || !config.WP_URL || !config.WP_USER || !config.WP_APP_PASS) {
  logger.error("Missing required environment variables");
  process.exit(1);
}

// Optional safety: warn if superuser not set
if (!config.SUPERUSER_ID) {
  logger.warn("SUPERUSER_ID not set in .env – no superuser will be recognized");
}

module.exports = config;
