import * as Sentry from '@sentry/browser';
import Transport, { TransportStreamOptions } from 'winston-transport';

// const winstonLevelToSentryLevel = {
//   debug: 'debug',
//   error: 'error',
//   info: 'info',
//   silly: 'debug',
//   verbose: 'debug',
//   warn: 'warning',
// };

interface Options extends TransportStreamOptions {
	key: string;
	project: string;
	level: string;
}

class SentryTransport extends Transport {
	options: {};

	constructor(options: Options) {
		super(options);
		const { key, project } = options;

		this.options = {
			dsn: `https://${key}@sentry.io/${project}`,
			...options,
		};

		Sentry.init(this.options);
	}

	/**
	 * @param {{}} info
	 * @param {string} info.level
	 * @param {Error|string} info.message
	 * @param {Function} done
	 */
	async log(info: any, done: (error?: Error, eventId?: any) => void) {
		// if (this.silent) {
		//   return done(undefined, true);
		// }

		try {
			const eventId =
				info.error instanceof Error
					? await Sentry.captureException(info)
					: await Sentry.captureMessage(info);
			done(undefined, eventId);
		} catch (error) {
			done(error);
		}
	}
}

export default SentryTransport;
