// import { createLogger, transports, format } from 'winston';
// import SentryTransport from './sentry-transport';
import Sentry from './sentry';
// import logCollection from '../../database/users/logs';

const PRODUCTION = process.env.NODE_ENV === 'production';

if (PRODUCTION) {
	Sentry.init({
		dsn: `${process.env.REACT_APP_SENTRY_DSN}`,
		enableAutoSessionTracking: true,
	});
}

const logLevels = ['info', 'error', 'warn', 'debug', 'verbose'];

class Logger {
	private logCollection: any;

	constructor() {
		// this.logCollection = logCollection;
	}

	log(message: any, context?: string): void {
		// this.winstonLogger.log('info', message, { context });
	}

	info(message: any, meta?: string): void {
		// this.winstonLogger.info(message, { context });
		console.log(message);
		// this.logCollection.then((collection) => {
		// 	if (collection) {
		// 		const date = new Date();
		// 		const timestamp = String(date.getTime());
		// 		collection.insert({ timestamp, level: 'info', message, meta });
		// 	}
		// });
	}

	error(message: any, trace?: string, context?: string): void {
		// this.winstonLogger.error(message, { context });
		// if (trace) {
		// 	this.winstonLogger.error(trace);
		// }
		// throw new Error('My first Sentry error!');
		// Sentry.nativeCrash();
		console.error(message);
	}

	warn(message: any, context?: string): void {
		// this.winstonLogger.warn(message, { context });
	}

	debug(message: any, meta?: {}): void {
		console.log(`[debug] ${message}`, meta);
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
