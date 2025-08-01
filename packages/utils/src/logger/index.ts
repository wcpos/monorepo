/**
 * Simple logger that works immediately and can be enhanced progressively
 */
import { logger } from 'react-native-logs';

// Global state
let toastShow: ((config: any) => void) | null = null;
let dbCollection: any | null = null;
let generateId: (() => string) | null = null;

/**
 * Set Toast function - call when Toast component is ready
 */
export const setToast = (toastShowFunction: (config: any) => void) => {
	toastShow = toastShowFunction;
};

/**
 * Set Database collection - call when database is ready
 */
export const setDatabase = (collection: any, idGenerator: () => string) => {
	dbCollection = collection;
	generateId = idGenerator;
};

/**
 * Main transport - handles console, toast, and database
 */
const mainTransport = (props: any) => {
	const { level, rawMsg } = props;

	// Parse message and options
	let message: string;
	let options: { showToast?: boolean; saveToDb?: boolean; context?: any } = {};

	if (Array.isArray(rawMsg)) {
		message = String(rawMsg[0] || '');
		if (rawMsg[1] && typeof rawMsg[1] === 'object') {
			options = rawMsg[1];
		}
	} else {
		message = String(rawMsg || '');
	}

	// 1. Always log to console
	const timestamp = new Date().toLocaleTimeString();
	const levelText = level.text.toUpperCase();
	const consoleMethod =
		level.text === 'error'
			? console.error
			: level.text === 'warn'
				? console.warn
				: level.text === 'info'
					? console.info
					: console.log;

	consoleMethod(`${timestamp} | ${levelText} : ${message}`);

	// 2. Show toast if available and requested
	const shouldShowToast = options.showToast ?? (level.text === 'warn' || level.text === 'error');
	if (shouldShowToast && toastShow) {
		// Get error code from context
		const errorCode = options.context?.errorCode;

		toastShow({
			type: level.text === 'error' ? 'error' : level.text === 'warn' ? 'error' : 'info',
			text1: errorCode ? `Error ${errorCode}` : 'Notification',
			text2: message,
			props: errorCode
				? {
						action: {
							label: 'Help',
							action: () => console.log(`Opening help for error code: ${errorCode}`),
						},
					}
				: undefined,
		});
	}

	// 3. Save to database if available and requested
	const shouldSaveToDb = options.saveToDb ?? (level.text !== 'silly' && level.text !== 'debug');
	if (shouldSaveToDb && dbCollection && generateId) {
		// Get error code from context
		const errorCode = options.context?.errorCode;

		dbCollection
			.insert({
				logId: generateId(),
				timestamp: Date.now(),
				code: errorCode,
				level: level.text,
				message,
				context: options.context || {},
			})
			.catch(console.error);
	}
};

// Create logger
const log = logger.createLogger({
	severity: __DEV__ ? 'debug' : 'error',
	transport: mainTransport as any,
	enabled: true,
});

export default log;
