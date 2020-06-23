import { createLogger, transports, format } from 'winston';
import SentryTransport from './sentry-transport';

const logLevels = ['info', 'error', 'warn', 'debug', 'verbose'];
const PRODUCTION = process.env.NODE_ENV === 'production';

class Logger {
	private readonly winstonLogger = createLogger();

	constructor() {
		if (PRODUCTION) {
			// console
			this.winstonLogger.add(
				new transports.Console({
					level: 'info',
					format: format.combine(
						// winston.format.splat(),
						format.colorize(),
						// winston.format.metadata({ key: 'meta' }),
						format.printf((info: any) => {
							console.log(info.meta);
							return `${info.level} ${info.message}`;
						})
					),
				})
			);
			// sentry
			this.winstonLogger.add(
				new SentryTransport({
					level: 'error',
				})
			);
		} else {
			// console
			this.winstonLogger.add(
				new transports.Console({
					format: format.combine(
						// winston.format.splat(),
						format.colorize(),
						// winston.format.metadata({ key: 'meta' }),
						format.printf((info: any) => {
							console.log(info.meta);
							return `${info.level} ${info.message}`;
						})
					),
				})
			);
			// file
			// this.winstonLogger.add(
			// 	new transports.File({
			// 		filename: 'wcpos.log',
			// 		level: 'debug',
			// 		format: format.combine(
			// 			format.timestamp(),
			// 			format.metadata(),
			// 			format.prettyPrint(),
			// 			format.json()
			// 		),
			// 	})
			// );
		}
	}

	log(message: any, context?: string): void {
		this.winstonLogger.log('info', message, { context });
	}

	info(message: any, context?: string): void {
		this.winstonLogger.info(message, { context });
	}

	error(message: any, trace?: string, context?: string): void {
		this.winstonLogger.error(message, { context });
		if (trace) {
			this.winstonLogger.error(trace);
		}
	}

	warn(message: any, context?: string): void {
		this.winstonLogger.warn(message, { context });
	}

	debug(message: any, context?: string): void {
		this.winstonLogger.debug(message, { context });
	}

	verbose(message: any, context?: string): void {
		this.winstonLogger.verbose(message, context);
	}

	startTimer() {
		return this.winstonLogger.startTimer();
	}
}

const instance = new Logger();
export { instance as default, Logger };
