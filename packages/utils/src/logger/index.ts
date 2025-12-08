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
	setLevel: (level: LogLevel) => void;
	getLevel: () => LogLevel;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Global state
let toastShow: ((config: any) => void) | null = null;
let dbCollection: any | null = null;

// Log level severity (lower = more verbose)
const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

// Initialize log level from localStorage (if available) or use default
function getInitialLogLevel(): LogLevel {
	if (typeof window !== 'undefined' && window.localStorage) {
		const stored = localStorage.getItem('wcpos_log_level');
		if (stored && LOG_LEVEL_SEVERITY.hasOwnProperty(stored)) {
			return stored as LogLevel;
		}
	}
	return __DEV__ ? 'debug' : 'info';
}

let currentLogLevel: LogLevel = getInitialLogLevel();

/**
 * Safe JSON stringify that handles circular references and large objects
 */
function safeStringify(obj: any, maxLength = 10000): string {
	const seen = new WeakSet();
	try {
		const result = JSON.stringify(obj, (key, value) => {
			// Handle circular references
			if (typeof value === 'object' && value !== null) {
				if (seen.has(value)) {
					return '[Circular]';
				}
				seen.add(value);
			}
			// Truncate very long strings
			if (typeof value === 'string' && value.length > 1000) {
				return value.substring(0, 1000) + '... [truncated]';
			}
			return value;
		});
		// Truncate the entire result if too long
		if (result && result.length > maxLength) {
			return result.substring(0, maxLength) + '... [truncated]';
		}
		return result;
	} catch (e) {
		return '[Unable to stringify]';
	}
}

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

	// Check if this log level should be shown (based on runtime level)
	const levelName = level.text as LogLevel;
	const levelSeverity = LOG_LEVEL_SEVERITY[levelName] ?? 0;
	const currentSeverity = LOG_LEVEL_SEVERITY[currentLogLevel];
	
	// Skip console logging if below current level (but still allow toast/db)
	const shouldLogToConsole = levelSeverity >= currentSeverity;

	// 1. Log to console if level permits
	if (shouldLogToConsole) {
		const timestamp = new Date().toLocaleTimeString();
		const levelText = level.text.toUpperCase();
		// console.errors open a redbox in development which is annoying
		const consoleMethod = console.log;

		// Include context in console output if available (using safe stringify)
		const contextStr = options.context ? ` | Context: ${safeStringify(options.context)}` : '';
		consoleMethod(`${timestamp} | ${levelText} : ${message}${contextStr}`);
	}

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

/**
 * Log Level Guidelines:
 * - DEBUG: Internal flow details, retries, skipped items (developer only, hidden in production)
 * - INFO:  Meaningful state changes worth tracking - successful syncs, logins, connections
 * - WARN:  Potential issues that don't block functionality
 * - ERROR: Failures that need attention
 *
 * In development: all logs (debug, info, warn, error)
 * In production: info, warn, error (debug is filtered for performance)
 *
 * Runtime log level can be changed via browser console:
 *   window.wcposLog.setLevel('debug')  // Show all logs
 *   window.wcposLog.setLevel('info')   // Default production level
 *   window.wcposLog.setLevel('warn')   // Only warnings and errors
 *   window.wcposLog.setLevel('error')  // Only errors
 *   window.wcposLog.getLevel()         // Get current level
 */
const baseLogger = logger.createLogger({
	severity: 'debug', // Always allow all levels through, we filter in transport
	transport: mainTransport as any,
	enabled: true,
});

/**
 * Set the runtime log level (persists to localStorage)
 */
const setLevel = (level: LogLevel) => {
	if (!LOG_LEVEL_SEVERITY.hasOwnProperty(level)) {
		console.warn(`Invalid log level: ${level}. Valid levels: debug, info, warn, error`);
		return;
	}
	currentLogLevel = level;
	// Persist to localStorage so it survives page refresh
	if (typeof window !== 'undefined' && window.localStorage) {
		localStorage.setItem('wcpos_log_level', level);
	}
	console.log(`Log level set to: ${level} (saved to localStorage)`);
};

/**
 * Get the current log level
 */
const getLevel = (): LogLevel => currentLogLevel;

/**
 * Reset log level to default (clears localStorage)
 */
const resetLevel = () => {
	if (typeof window !== 'undefined' && window.localStorage) {
		localStorage.removeItem('wcpos_log_level');
	}
	currentLogLevel = __DEV__ ? 'debug' : 'info';
	console.log(`Log level reset to default: ${currentLogLevel}`);
};

// Extend with custom methods
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
	setLevel,
	getLevel,
} as ExtendedLogger;

// Expose to window for browser console access
if (typeof window !== 'undefined') {
	(window as any).wcposLog = {
		setLevel,
		getLevel,
		resetLevel,
		debug: log.debug,
		info: log.info,
		warn: log.warn,
		error: log.error,
		success: log.success,
	};
}

export default log;
