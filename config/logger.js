const winston = require("winston");

const transports = [
  new winston.transports.Console({
    format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
  }),
];

if (process.env.LOG_TO_FILE === "true") {
  transports.push(
    new winston.transports.File({
      filename: "bot.log",
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    })
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  transports,
});

module.exports = logger;
