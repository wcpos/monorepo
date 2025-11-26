/**
 * Simple logger that works immediately and can be enhanced progressively
 */
import { logger } from 'react-native-logs';

import { getErrorCodeDocURL } from './constants';

// Custom options interface
export interface LoggerOptions {
	showToast?: boolean;
	saveToDb?: boolean;
	context?: any;
	toast?: {
		text2?: string; // Secondary message
		dismissable?: boolean; // Show close button
		showErrorCode?: boolean; // Show error code "Help" link (default: true if errorCode exists)
		action?: {
			label: string; // Action button label (e.g., "Undo")
			onClick: () => void; // Custom action handler
		};
	};
}

// Extended logger interface with custom options support
export interface ExtendedLogger {
	error: (message: string, options?: LoggerOptions) => void;
	warn: (message: string, options?: LoggerOptions) => void;
	info: (message: string, options?: LoggerOptions) => void;
	debug: (message: string, options?: LoggerOptions) => void;
	success: (message: string, options?: LoggerOptions) => void;
}

// Global state
let toastShow: ((config: any) => void) | null = null;
let dbCollection: any | null = null;

/**
 * Set Toast function - call when Toast component is ready
 */
export const setToast = (toastShowFunction: (config: any) => void) => {
	toastShow = toastShowFunction;
};

/**
 * Set Database collection - call when database is ready
 */
export const setDatabase = (collection: any) => {
	dbCollection = collection;
};

/**
 * Main transport - handles console, toast, and database
 */
const mainTransport = (props: any) => {
	const { level, rawMsg } = props;

	// Parse message and options
	let message: string;
	let options: LoggerOptions = {};

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
	// const consoleMethod =
	// 	level.text === 'error'
	// 		? console.error
	// 		: level.text === 'warn'
	// 			? console.warn
	// 			: level.text === 'info' || level.text === 'success'
	// 				? console.info
	// 				: console.log;
	// console.errors open a redbox in development which is annoying
	const consoleMethod = console.log;

	// Include context in console output if available
	const contextStr = options.context ? ` | Context: ${JSON.stringify(options.context)}` : '';
	consoleMethod(`${timestamp} | ${levelText} : ${message}${contextStr}`);

	// 2. Show toast if available and requested
	if (options.showToast && toastShow) {
		// Get error code from context
		const errorCode = options.context?.errorCode;

		// Map log levels to toast types
		let toastType = level.text;
		if (level.text === 'warn') {
			toastType = 'warning';
		}

		// Build toast config using NEW format (not legacy text1/text2)
		const toastConfig: any = {
			type: toastType,
			title: message, // New format uses 'title' not 'text1'
		};

		// Add secondary message (description in new format)
		if (options.toast?.text2) {
			toastConfig.description = options.toast.text2;
		}

		// Add dismissable/close button
		if (options.toast?.dismissable !== undefined) {
			toastConfig.closeButton = options.toast.dismissable;
		}

		// Handle actions - custom action takes precedence, then error code help link
		if (options.toast?.action) {
			// Custom action takes precedence
			toastConfig.action = {
				label: options.toast.action.label,
				onClick: options.toast.action.onClick,
			};
		} else if (errorCode) {
			// Show error code help link by default (can be disabled per-call)
			const shouldShowErrorCode = options.toast?.showErrorCode ?? true;

			if (shouldShowErrorCode) {
				const errorCodeURL = getErrorCodeDocURL(errorCode);
				toastConfig.action = {
					label: 'Help',
					onClick: async () => {
						// Dynamically import to avoid circular dependencies
						try {
							const { openExternalURL } = await import('../open-external-url');
							await openExternalURL(errorCodeURL);
						} catch (error) {
							console.error(`Failed to open error code documentation: ${errorCodeURL}`, error);
						}
					},
				};
			}
		}

		toastShow(toastConfig);
	}

	// 3. Save to database if available and requested
	if (options.saveToDb && dbCollection) {
		// Get error code from context
		const errorCode = options.context?.errorCode || '';

		dbCollection
			.insert({
				timestamp: Date.now(),
				code: errorCode,
				level: level.text,
				message,
				context: options.context || {},
			})
			.catch(console.error);
	}
};

// Create logger with custom levels
const baseLogger = logger.createLogger({
	severity: __DEV__ ? 'debug' : 'error',
	transport: mainTransport as any,
	enabled: true,
});

// Extend with custom success method
const log = {
	...baseLogger,
	success: (message: string, options?: LoggerOptions) => {
		// Create a custom level object for success
		const successLevel = { severity: 1, text: 'success' };
		mainTransport({
			level: successLevel,
			rawMsg: options ? [message, options] : message,
		});
	},
} as ExtendedLogger;

export default log;
