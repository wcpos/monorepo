/**
 * Simple logger that works immediately and can be enhanced progressively
 *
 * Features:
 * - Hierarchical categories: getLogger(['wcpos', 'pos', 'cart'])
 * - Explicit contexts: logger.with({ orderId: '123' })
 * - Lazy evaluation: logger.debug(() => expensiveComputation())
 * - Toast notifications and database persistence
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

/**
 * Lazy message type - either a string or a function that returns a string
 * Use functions for expensive computations that should only run if the log level is enabled
 */
export type LazyMessage = string | (() => string);

/**
 * Lazy context type - either an object or a function that returns an object
 */
export type LazyContext = Record<string, any> | (() => Record<string, any>);

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
	} catch {
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

/**
 * ============================================================================
 * HIERARCHICAL CATEGORY LOGGER
 * ============================================================================
 *
 * Create loggers with hierarchical categories for better organization:
 *
 * @example
 * ```typescript
 * const posLogger = getLogger(['wcpos', 'pos']);
 * const cartLogger = posLogger.getChild('cart');
 *
 * // With bound context
 * const orderLogger = cartLogger.with({ orderId: '123' });
 * orderLogger.info('Item added'); // Includes category and orderId automatically
 * ```
 */

/**
 * Resolve a lazy value (function or direct value)
 */
function resolveLazy<T>(value: T | (() => T)): T {
	return typeof value === 'function' ? (value as () => T)() : value;
}

/**
 * Check if the given log level should be logged based on current level
 */
function shouldLog(level: LogLevel): boolean {
	const levelSeverity = LOG_LEVEL_SEVERITY[level] ?? 0;
	const currentSeverity = LOG_LEVEL_SEVERITY[currentLogLevel];
	return levelSeverity >= currentSeverity;
}

/**
 * Category-based logger with hierarchical organization
 *
 * @example
 * ```typescript
 * const logger = getLogger(['wcpos', 'pos', 'cart']);
 * logger.info('Item added to cart');
 * // Output: "10:30:45 | INFO : Item added to cart | Context: {"category":"wcpos.pos.cart"}"
 * ```
 */
export class CategoryLogger {
	constructor(
		protected category: string[],
		protected boundContext: Record<string, any> = {}
	) {}

	/**
	 * Create a child logger with additional category segments
	 *
	 * @example
	 * ```typescript
	 * const posLogger = getLogger(['wcpos', 'pos']);
	 * const cartLogger = posLogger.getChild('cart');
	 * const checkoutLogger = posLogger.getChild(['checkout', 'payment']);
	 * ```
	 */
	getChild(subcategory: string | string[]): CategoryLogger {
		const sub = Array.isArray(subcategory) ? subcategory : [subcategory];
		return new CategoryLogger([...this.category, ...sub], this.boundContext);
	}

	/**
	 * Create a new logger with bound context that persists across all log calls
	 *
	 * @example
	 * ```typescript
	 * const orderLogger = logger.with({ orderId: '123', customerId: '456' });
	 * orderLogger.info('Processing'); // orderId and customerId automatically included
	 * orderLogger.info('Complete');   // Same context, no need to repeat
	 * ```
	 */
	with(context: Record<string, any>): CategoryLogger {
		return new CategoryLogger(this.category, {
			...this.boundContext,
			...context,
		});
	}

	/**
	 * Get the category as a dot-separated string
	 */
	getCategoryString(): string {
		return this.category.join('.');
	}

	/**
	 * Build the final options object with category and bound context
	 */
	protected buildOptions(options?: LoggerOptions): LoggerOptions {
		return {
			...options,
			context: {
				category: this.getCategoryString(),
				...this.boundContext,
				...options?.context,
			},
		};
	}

	/**
	 * Debug level log - for development details, hidden in production by default
	 *
	 * Supports lazy evaluation:
	 * @example
	 * ```typescript
	 * // Eager - always computed
	 * logger.debug('Cart state', { context: { items: cart.items } });
	 *
	 * // Lazy - only computed if debug level is enabled
	 * logger.debug(() => `Cart state: ${JSON.stringify(cart.getFullState())}`);
	 * ```
	 */
	debug(message: LazyMessage, options?: LoggerOptions): void {
		// Only resolve lazy message if we're actually going to log
		if (!shouldLog('debug') && !options?.showToast && !options?.saveToDb) {
			return;
		}
		const resolvedMessage = resolveLazy(message);
		log.debug(resolvedMessage, this.buildOptions(options));
	}

	/**
	 * Info level log - meaningful state changes worth tracking
	 */
	info(message: LazyMessage, options?: LoggerOptions): void {
		const resolvedMessage = resolveLazy(message);
		log.info(resolvedMessage, this.buildOptions(options));
	}

	/**
	 * Warning level log - potential issues that don't block functionality
	 */
	warn(message: LazyMessage, options?: LoggerOptions): void {
		const resolvedMessage = resolveLazy(message);
		log.warn(resolvedMessage, this.buildOptions(options));
	}

	/**
	 * Error level log - failures that need attention
	 */
	error(message: LazyMessage, options?: LoggerOptions): void {
		const resolvedMessage = resolveLazy(message);
		log.error(resolvedMessage, this.buildOptions(options));
	}

	/**
	 * Success level log - successful user actions
	 */
	success(message: LazyMessage, options?: LoggerOptions): void {
		const resolvedMessage = resolveLazy(message);
		log.success(resolvedMessage, this.buildOptions(options));
	}
}

/**
 * Factory function to create a category-based logger
 *
 * @param category - Array of category segments (e.g., ['wcpos', 'pos', 'cart'])
 * @returns CategoryLogger instance
 *
 * @example
 * ```typescript
 * // Create a logger for the POS cart module
 * const cartLogger = getLogger(['wcpos', 'pos', 'cart']);
 *
 * // Log with automatic category context
 * cartLogger.info('Product added', { context: { productId: '123' } });
 *
 * // Create a child logger for checkout
 * const checkoutLogger = cartLogger.getChild('checkout');
 *
 * // Create a logger with bound context for a specific order
 * const orderLogger = cartLogger.with({ orderId: order.uuid });
 * orderLogger.info('Line item added');
 * orderLogger.info('Discount applied');
 * orderLogger.success('Order saved', { showToast: true });
 * ```
 */
export function getLogger(category: string[]): CategoryLogger {
	return new CategoryLogger(category);
}

export default log;
