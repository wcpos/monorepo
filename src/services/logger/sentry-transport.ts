import Transport from 'winston-transport';
import Sentry from './sentry';

Sentry.init({ dsn: `${process.env.REACT_APP_SENTRY_DSN}` });

type TransportStreamOptions = import('winston-transport').TransportStreamOptions;
type SentryType = typeof Sentry;

const winstonLevelToSentryLevel = {
	debug: 'debug',
	error: 'error',
	info: 'info',
	silly: 'debug',
	verbose: 'debug',
	warn: 'warning',
};

class SentryTransport extends Transport {
	public readonly name = 'Sentry';

	// eslint-disable-next-line no-useless-constructor
	constructor(options: TransportStreamOptions) {
		super(options);
	}

	/**
	 * @param {{}} info
	 * @param {string} info.level
	 * @param {Error|string} info.message
	 * @param {Function} done
	 */
	async log(info: any, done: (error?: Error, eventId?: any) => void): Promise<void> {
		if (this.silent) {
			return done(undefined, true);
		}

		try {
			const eventId =
				info.error instanceof Error
					? await Sentry.captureException(info)
					: await Sentry.captureMessage(info);
			return done(undefined, eventId);
		} catch (error) {
			return done(error);
		}
	}
}

export default SentryTransport;
