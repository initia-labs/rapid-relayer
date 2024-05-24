import * as winston from "winston";

const myFormat = winston.format.printf(({ level, message, timestamp }) => {
  const logPath = "";
  return `${timestamp} ${level}: ${logPath}${message}`;
});

export const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(winston.format.timestamp(), myFormat),
  transports: [new winston.transports.Console()],
});

export function info(msg: string): void {
  logger.info(msg);
}

export function warn(msg: string): void {
  logger.warn(msg);
}

export function error(msg: string): void {
  logger.error(msg);
}

export function debug(msg: string): void {
  logger.debug(msg);
}
