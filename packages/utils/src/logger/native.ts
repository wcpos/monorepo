/**
 * Example Sentry transport for native
 */
import * as Sentry from '@sentry/react-native';

export enum LogLevel {
	Debug = 'debug',
	Info = 'info',
	Log = 'log',
	Warn = 'warn',
	Error = 'error',
}

/**
 * A union of some of Sentry's breadcrumb properties as well as Sentry's
 * `captureException` parameter, `CaptureContext`.
 */
type Metadata = {
	/**
	 * Applied as Sentry breadcrumb types. Defaults to `default`.
	 *
	 * @see https://develop.sentry.dev/sdk/event-payloads/breadcrumbs/#breadcrumb-types
	 */
	type?:
		| 'default'
		| 'debug'
		| 'error'
		| 'navigation'
		| 'http'
		| 'info'
		| 'query'
		| 'transaction'
		| 'ui'
		| 'user';

	/**
	 * Passed through to `Sentry.captureException`
	 *
	 * @see https://github.com/getsentry/sentry-javascript/blob/903addf9a1a1534a6cb2ba3143654b918a86f6dd/packages/types/src/misc.ts#L65
	 */
	tags?: {
		[key: string]: number | string | boolean | bigint | symbol | null | undefined;
	};

	/**
	 * Any additional data, passed through to Sentry as `extra` param on
	 * exceptions, or the `data` param on breadcrumbs.
	 */
	[key: string]: unknown;
} & Parameters<typeof Sentry.captureException>[1];

type Transport = (level: LogLevel, message: string | Error, metadata: Metadata) => void;

export const sentryTransport: Transport = (level, message, { type, tags, ...metadata }) => {
	/**
	 * If a string, report a breadcrumb
	 */
	if (typeof message === 'string') {
		const severity = {
			[LogLevel.Debug]: Sentry.Severity.Debug,
			[LogLevel.Info]: Sentry.Severity.Info,
			[LogLevel.Log]: Sentry.Severity.Log, // Sentry value here is undefined
			[LogLevel.Warn]: Sentry.Severity.Warning,
			[LogLevel.Error]: Sentry.Severity.Error,
		}[level];

		Sentry.addBreadcrumb({
			message,
			data: metadata,
			type: type || 'default',
			level: severity,
			timestamp: Date.now(),
		});

		/**
		 * If a log, also capture as a message
		 */
		if (level === LogLevel.Log) {
			Sentry.captureMessage(message, {
				tags,
				extra: metadata,
			});
		}

		/**
		 * If warn, also capture as a message, but with level warning
		 */
		if (level === LogLevel.Warn) {
			Sentry.captureMessage(message, {
				level: Sentry.Severity.Warning,
				tags,
				extra: metadata,
			});
		}
	} else {
		/**
		 * It's otherwise an Error and should be reported as onReady
		 */
		Sentry.captureException(message, {
			tags,
			extra: metadata,
		});
	}
};
