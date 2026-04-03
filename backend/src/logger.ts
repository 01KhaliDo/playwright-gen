// =============================================================================
// logger.ts — Winston-logger för strukturerad loggning
// =============================================================================
import winston from 'winston';

export const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message }) => {
            return `[${level.toUpperCase()}] ${timestamp} ${message}`;
        })
    ),
    transports: [new winston.transports.Console()],
});
