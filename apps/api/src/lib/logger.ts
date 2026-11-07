import winston from 'winston';
import { appConfig } from '../config/app.config';

/** Logger terstruktur (JSON). Password/token tidak boleh di-log (Bagian 14.5). */
export const logger = winston.createLogger({
  level: appConfig.logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [new winston.transports.Console({ silent: appConfig.env === 'test' })],
});
