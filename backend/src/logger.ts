// =============================================================================
// logger.ts — Winston-logger för strukturerad loggning
// =============================================================================
import winston from 'winston';

const COLORS: Record<string, string> = {
    info:  '\x1b[36m',  // cyan
    warn:  '\x1b[33m',  // yellow
    error: '\x1b[31m',  // red
    debug: '\x1b[90m',  // gray
    reset: '\x1b[0m',
};

export const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message }) => {
            const color = COLORS[level] || '';
            const reset = COLORS.reset;
            return `${color}[${level.toUpperCase()}]${reset} ${timestamp} ${message}`;
        })
    ),
    transports: [new winston.transports.Console()],
});
