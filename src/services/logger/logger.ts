// import { createLogger, transports, format } from 'winston';
// import SentryTransport from './sentry-transport';
import Sentry from './sentry';
import logCollection from '../../database/user/logs';

const PRODUCTION = process.env.NODE_ENV === 'production';

Sentry.init({
	dsn: `${process.env.REACT_APP_SENTRY_DSN}`,
	enableAutoSessionTracking: PRODUCTION,
});

const logLevels = ['info', 'error', 'warn', 'debug', 'verbose'];

class Logger {
	private logCollection = logCollection;

	constructor() {}

	log(message: any, context?: string): void {
		// this.winstonLogger.log('info', message, { context });
	}

	info(message: any, context?: string): void {
		// this.winstonLogger.info(message, { context });
		console.log(message);
		this.logCollection.then((collection) => {
			const date = new Date();
			const timestamp = String(date.getTime());
			collection.insert({ timestamp, level: 'info', message });
		});
	}

	error(message: any, trace?: string, context?: string): void {
		// this.winstonLogger.error(message, { context });
		// if (trace) {
		// 	this.winstonLogger.error(trace);
		// }
		// throw new Error('My first Sentry error!');
		// Sentry.nativeCrash();
	}

	warn(message: any, context?: string): void {
		// this.winstonLogger.warn(message, { context });
	}

	debug(message: any, context?: string): void {
		// this.winstonLogger.debug(message, { context });
	}

	verbose(message: any, context?: string): void {
		// this.winstonLogger.verbose(message, context);
	}

	startTimer() {
		// return this.winstonLogger.startTimer();
	}
}

const instance = new Logger();
export { instance as default, Logger };
