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
import {
	clearRecorder,
	recorderStats,
	recordEvent,
	removePromotedEvents,
	snapshotRecorder,
} from './flight-recorder';
import { ERROR_CATALOGUE, ErrorCode } from './generated/error-codes.generated';
import { redactSensitiveFields, redactSensitiveText } from './redact';
import { LogRetentionCollection, sweepLogRetention } from './retention';

/**
 * Schema-v2 terminal-record columns. These are promoted to top-level log row
 * fields (not nested in `context`) so the Logs UI and exports can filter and
 * group on them without parsing context.
 */
export interface LogTerminalFields {
	outcome?: 'ok' | 'recovered' | 'failed' | 'rejected' | 'cancelled' | 'unknown';
	operationId?: string;
	operationType?: string;
	requestId?: string;
	serverRequestId?: string;
	attempt?: number;
	durationMs?: number;
	startedAt?: number;
}

// Custom options interface
export interface LoggerOptions {
	code?: ErrorCode;
	showToast?: boolean;
	context?: any;
	terminal?: LogTerminalFields;
	toast?: {
		title?: string; // Override the toast title when the log message is forensic (ids, codes) rather than cashier-readable
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
	error: (message: string, options: LoggerOptions & { code: ErrorCode }) => void;
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
let databaseEpoch = 0;
let sequence = 0;
let persistedInsertCount = 0;
let recorderPromotionChain: Promise<void> = Promise.resolve();
const MAX_CONTEXT_BYTES = 16 * 1024;
const SWEEP_INSERT_INTERVAL = 200;

type PersistedDocument = {
	incrementalPatch(patch: Record<string, unknown>): Promise<PersistedDocument>;
};

type LoggerCollection = LogRetentionCollection & {
	insert(row: Record<string, unknown>): Promise<PersistedDocument>;
	bulkInsert(
		rows: Record<string, unknown>[]
	): Promise<{ success: { seq?: unknown }[]; error: unknown[] }>;
};

type RepeatState = {
	identity: string;
	count: number;
	write: Promise<PersistedDocument | undefined>;
};

const repeatStateByCollection = new WeakMap<object, RepeatState>();

const SEARCH_CONTEXT_KEY =
	/^(category|event|orderI[Dd]|orderUUID|orderNumber|documentId|collectionName|collection|type|lane|productId|productName|sku|itemName|couponCode|feeName|method|methodTitle|endpoint|status|customerId|errorCode|reason|previousQuantity|quantity|previousPrice|price)$/;

function searchableContext(context: Record<string, any>): string {
	return Object.entries(context)
		.filter(([key, value]) => SEARCH_CONTEXT_KEY.test(key) && value != null)
		.map(([, value]) => value)
		.join(' ');
}

function serializedBytes(value: unknown): number {
	return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function admitContext(context: Record<string, unknown>): Record<string, unknown> {
	if (serializedBytes(context) <= MAX_CONTEXT_BYTES) return context;

	const admitted: Record<string, unknown> = { _truncated: true };
	let droppedKeys = 0;
	for (const [key, value] of Object.entries(context)) {
		admitted[key] = value;
		if (serializedBytes(admitted) > MAX_CONTEXT_BYTES) {
			admitted[key] = '[truncated]';
			if (serializedBytes(admitted) > MAX_CONTEXT_BYTES) {
				delete admitted[key];
				droppedKeys += 1;
			}
		}
	}
	if (droppedKeys > 0) admitted._droppedKeys = droppedKeys;
	return admitted;
}

function recordSize(row: Record<string, unknown>): Record<string, unknown> {
	row.sizeBytes = 0;
	let sizeBytes = serializedBytes(row);
	while (row.sizeBytes !== sizeBytes) {
		row.sizeBytes = sizeBytes;
		sizeBytes = serializedBytes(row);
	}
	return row;
}

/**
 * #163: with a dead storage worker every error log triggers a promotion, the
 * promotion's bulkInsert rejects, and the catch below logs — roughly 200
 * errors/second measured live, which buries the real diagnostics and burns the
 * main thread during exactly the outage you most need to debug. Promotion is
 * best-effort narration, so a failing streak backs off instead of hammering, and
 * reports once per streak rather than once per attempt.
 */
const RECORDER_PROMOTION_BASE_BACKOFF_MS = 1_000;
const RECORDER_PROMOTION_MAX_BACKOFF_MS = 60_000;
let recorderPromotionFailureStreak = 0;
let recorderPromotionRetryAt = 0;

/** Clears the promotion backoff. Called when a new database binds, and by tests. */
export function resetRecorderPromotionBackoff(): void {
	recorderPromotionFailureStreak = 0;
	recorderPromotionRetryAt = 0;
}

async function runRecorderPromotion(reason: string, requestedEpoch: number): Promise<number> {
	try {
		if (requestedEpoch !== databaseEpoch) return 0;
		// Storage is still failing and the backoff window has not elapsed — skip the
		// attempt entirely. Recorded events stay in the recorder for the next one.
		if (recorderPromotionFailureStreak > 0 && Date.now() < recorderPromotionRetryAt) return 0;
		const collection = dbCollection as LoggerCollection | null;
		const recorded = snapshotRecorder();
		if (!collection || recorded.length === 0) return 0;

		const rows = recorded.map((event) => {
			sequence += 1;
			const terminal = event.terminal;
			// Mirror persistLog's column extraction so promoted narration answers the
			// same category/code filters as live rows — otherwise the trail is present
			// but invisible behind the Logs tab's preset chips.
			const code = clampColumn(
				'code',
				typeof event.context.errorCode === 'string' ? event.context.errorCode : undefined
			);
			const category = clampColumn(
				'category',
				typeof event.context.category === 'string' ? event.context.category : undefined
			);
			return recordSize({
				timestamp: event.timestamp,
				level: event.level,
				message: event.message,
				context: { ...event.context, _promotedBy: reason },
				seq: sequence,
				count: 1,
				firstSeen: event.timestamp,
				lastSeen: event.timestamp,
				...(code && { code }),
				...(category && { category }),
				...(terminal?.outcome && { outcome: terminal.outcome }),
				...(terminal?.operationId !== undefined && {
					operationId: clampColumn('operationId', terminal.operationId),
				}),
				...(terminal?.operationType !== undefined && {
					operationType: clampColumn('operationType', terminal.operationType),
				}),
				...(terminal?.requestId !== undefined && {
					requestId: clampColumn('requestId', terminal.requestId),
				}),
				...(terminal?.serverRequestId !== undefined && {
					serverRequestId: clampColumn('serverRequestId', terminal.serverRequestId),
				}),
				...(terminal?.attempt !== undefined && { attempt: terminal.attempt }),
				...(terminal?.durationMs !== undefined && { durationMs: terminal.durationMs }),
				...(terminal?.startedAt !== undefined && { startedAt: terminal.startedAt }),
			});
		});
		const result = await collection.bulkInsert(rows);
		// The collection can be rebound while this was in flight; the old
		// database's outcome must not reset or advance the new one's backoff.
		if (requestedEpoch !== databaseEpoch) return 0;
		const insertedSequences = new Set(result.success.map((document) => document.seq));
		removePromotedEvents(recorded.filter((_, index) => insertedSequences.has(rows[index].seq)));
		// bulkInsert resolves with separate success/error arrays, so a total write
		// failure never reaches the catch below. Treat it as the failed attempt it
		// is, or the same snapshot is retried on every error log — the exact
		// hammering this backoff exists to stop.
		if (result.success.length === 0) {
			noteRecorderPromotionFailure(
				new Error(`flight recorder promotion rejected all ${rows.length} rows`)
			);
			return 0;
		}
		resetRecorderPromotionBackoff();
		return result.success.length;
	} catch (error) {
		if (requestedEpoch !== databaseEpoch) return 0;
		noteRecorderPromotionFailure(error);
		return 0;
	}
}

function noteRecorderPromotionFailure(error: unknown): void {
	recorderPromotionFailureStreak += 1;
	recorderPromotionRetryAt =
		Date.now() +
		Math.min(
			RECORDER_PROMOTION_BASE_BACKOFF_MS * 2 ** (recorderPromotionFailureStreak - 1),
			RECORDER_PROMOTION_MAX_BACKOFF_MS
		);
	// Once per streak: the first failure carries the diagnosis, the next 200 a
	// second carry nothing. A later success resets the streak, so a genuinely
	// new outage is reported again.
	if (recorderPromotionFailureStreak === 1) {
		console.error('Failed to promote flight recorder', error);
	}
}

export function promoteRecorder(reason: string): Promise<number> {
	const requestedEpoch = databaseEpoch;
	const run = recorderPromotionChain.then(() => runRecorderPromotion(reason, requestedEpoch));
	recorderPromotionChain = run.then(
		() => undefined,
		() => undefined
	);
	return run;
}

/**
 * Schema-enforced maxLength of every bounded string column in the `logs` v2
 * schema. RxDB rejects the WHOLE insert when one exceeds its limit, so an
 * over-long value would cost the entire terminal record rather than just that
 * field — e.g. a 36-character UUID in the 32-character `operationId`. Clamping
 * keeps the row (and the identifier's greppable prefix); losing the row is the
 * one outcome this logger must never produce.
 */
const COLUMN_MAX_LENGTH = {
	code: 24,
	category: 64,
	operationId: 32,
	operationType: 48,
	requestId: 40,
	serverRequestId: 40,
} as const;

function clampColumn<K extends keyof typeof COLUMN_MAX_LENGTH>(
	column: K,
	value: string | undefined
): string | undefined {
	if (value === undefined) return undefined;
	const max = COLUMN_MAX_LENGTH[column];
	return value.length > max ? value.slice(0, max) : value;
}

const GENERIC_ERROR_CODES = [
	['wcpos.pos.checkout.payment', 'PAYMENT999'],
	['wcpos.payment', 'PAYMENT999'],
	['wcpos.pos.checkout', 'CHECKOUT999'],
	['wcpos.checkout', 'CHECKOUT999'],
	['wcpos.sync', 'SYNC999'],
	['wcpos.auth', 'AUTH999'],
	['wcpos.print', 'PRINT999'],
	['wcpos.product', 'PRODUCT999'],
	['wcpos.license', 'LICENSE999'],
] as const satisfies readonly (readonly [string, ErrorCode])[];

function genericErrorCode(category: string | undefined): ErrorCode {
	return GENERIC_ERROR_CODES.find(([prefix]) => category?.startsWith(prefix))?.[1] ?? 'CLIENT999';
}

function persistLog(
	collection: LoggerCollection,
	level: LogLevel,
	message: string,
	context: Record<string, unknown>,
	terminal?: LogTerminalFields
): void {
	const now = Date.now();
	const outcome = terminal?.outcome;
	let persistedContext = context;
	let code = clampColumn(
		'code',
		typeof context.errorCode === 'string' ? context.errorCode : undefined
	);
	const category = clampColumn(
		'category',
		typeof context.category === 'string' ? context.category : undefined
	);
	if (level === 'error' && outcome !== 'ok' && !code) {
		code = genericErrorCode(category);
		persistedContext = { ...context, errorCode: code, codeFallback: true };
	}
	if (outcome === 'ok' && code && ERROR_CATALOGUE[code as ErrorCode]?.severity === 'error') {
		persistedContext = { ...context };
		delete persistedContext.errorCode;
		console.error(`Dropped failure-severity code ${code} from log row with outcome ok`);
		code = undefined;
	}
	const admittedContext = admitContext({
		...persistedContext,
		search: searchableContext(persistedContext),
	});
	const identity = JSON.stringify([
		level,
		code ?? null,
		category ?? null,
		message,
		context.recordId ?? null,
		outcome ?? null,
		// Chained operations are distinct units of work and must not collapse.
		// Uncorrelated record failures keep null here and still collapse by record/reason.
		terminal?.operationId ?? null,
		// Collection is part of the identity or per-collection events with no
		// message of their own collapse across collections: one change-signal cycle
		// emitting apply.refresh for tax_rates and then for another collection
		// matches on every other component, so the second would fold into the first
		// and the surviving row would name only the first collection — attributing
		// evidence to the wrong collection, which is worse than an extra row.
		context.collection ?? null,
		context.cursor ?? null,
		context.cursorFrom ?? null,
		context.head ?? null,
		context.backlog ?? null,
	]);
	// Repeat-collapse folds identical consecutive REPEATS — the same event, record
	// and reason (spec §7). A record carrying a duration is not a repeat: it is a
	// distinct timed unit of work whose duration and cursor ARE the evidence, so two
	// sync cycles that happen to render the same message must stay two rows rather
	// than folding and discarding the second one's numbers. Everything without a
	// duration (record failures, state transitions) still collapses normally, which
	// is what keeps a failing record from flooding the log.
	const timedUnitOfWork = terminal?.durationMs !== undefined;
	const previous = timedUnitOfWork ? undefined : repeatStateByCollection.get(collection);

	if (previous?.identity === identity) {
		previous.count += 1;
		previous.write = previous.write.then((document) =>
			document?.incrementalPatch({ count: previous.count, lastSeen: now })
		);
		// A rejected chain would silently swallow every later identical event —
		// drop the repeat state so the next occurrence inserts a fresh row.
		void previous.write.catch((error: unknown) => {
			console.error(error);
			if (repeatStateByCollection.get(collection) === previous) {
				repeatStateByCollection.delete(collection);
			}
		});
		return;
	}

	sequence += 1;
	const row = recordSize({
		timestamp: now,
		level,
		message,
		context: admittedContext,
		seq: sequence,
		count: 1,
		firstSeen: now,
		lastSeen: now,
		...(code && { code }),
		...(category && { category }),
		...(outcome && { outcome }),
		...(terminal?.operationId !== undefined && {
			operationId: clampColumn('operationId', terminal.operationId),
		}),
		...(terminal?.operationType !== undefined && {
			operationType: clampColumn('operationType', terminal.operationType),
		}),
		...(terminal?.requestId !== undefined && {
			requestId: clampColumn('requestId', terminal.requestId),
		}),
		...(terminal?.serverRequestId !== undefined && {
			serverRequestId: clampColumn('serverRequestId', terminal.serverRequestId),
		}),
		...(terminal?.attempt !== undefined && { attempt: terminal.attempt }),
		...(terminal?.durationMs !== undefined && { durationMs: terminal.durationMs }),
		...(terminal?.startedAt !== undefined && { startedAt: terminal.startedAt }),
	});
	const writeEpoch = databaseEpoch;
	const write = Promise.resolve().then(() => {
		if (writeEpoch !== databaseEpoch || collection !== dbCollection) return undefined;
		return collection.insert(row);
	});
	const state: RepeatState = { identity, count: 1, write };
	// A timed unit of work is never a collapse anchor either — the next identical
	// row must not fold into it.
	if (timedUnitOfWork) repeatStateByCollection.delete(collection);
	else repeatStateByCollection.set(collection, state);
	void write.catch(() => {
		if (repeatStateByCollection.get(collection) === state) {
			repeatStateByCollection.delete(collection);
		}
	});
	void write
		.then((document) => {
			if (!document) {
				if (repeatStateByCollection.get(collection) === state) {
					repeatStateByCollection.delete(collection);
				}
				return;
			}
			notifyLogPersistedInsert(collection);
		})
		.catch(console.error);
}

export function notifyLogPersistedInsert(collection: LogRetentionCollection): void {
	persistedInsertCount += 1;
	if (persistedInsertCount % SWEEP_INSERT_INTERVAL === 0) {
		void sweepLogRetention(collection).catch((error: unknown) =>
			console.error('Failed to enforce log retention', error)
		);
	}
}

// Log level severity (lower = more verbose)
const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

function isDevelopment(): boolean {
	return typeof __DEV__ !== 'undefined' && __DEV__;
}

// Initialize log level from localStorage (if available) or use default
function getInitialLogLevel(): LogLevel {
	if (typeof window !== 'undefined' && window.localStorage) {
		const stored = localStorage.getItem('wcpos_log_level');
		if (stored && LOG_LEVEL_SEVERITY.hasOwnProperty(stored)) {
			return stored as LogLevel;
		}
	}
	return isDevelopment() ? 'debug' : 'info';
}

let currentLogLevel: LogLevel = getInitialLogLevel();

const VERBOSE_DIAGNOSTICS_KEY = 'wcpos_verbose_diagnostics';
const DEFAULT_VERBOSE_TTL_MS = 24 * 60 * 60 * 1000;

function getInitialVerboseExpiry(): number {
	try {
		if (typeof window !== 'undefined' && window.localStorage) {
			const expiresAt = Number(window.localStorage.getItem(VERBOSE_DIAGNOSTICS_KEY));
			if (Number.isFinite(expiresAt) && Date.now() < expiresAt) return expiresAt;
		}
	} catch {
		// Storage may be unavailable even when the browser exposes localStorage.
	}
	return 0;
}

const initialVerboseExpiry = getInitialVerboseExpiry();
let verboseDiagnosticsEnabled = initialVerboseExpiry > 0;
let verboseDiagnosticsExpiresAt = initialVerboseExpiry;

export function isVerboseDiagnostics(): boolean {
	return verboseDiagnosticsEnabled && Date.now() < verboseDiagnosticsExpiresAt;
}

export function setVerboseDiagnostics(enabled: boolean, ttlMs = DEFAULT_VERBOSE_TTL_MS): void {
	verboseDiagnosticsEnabled = enabled;
	verboseDiagnosticsExpiresAt = enabled ? Date.now() + ttlMs : 0;

	try {
		if (typeof window !== 'undefined' && window.localStorage) {
			if (enabled) {
				window.localStorage.setItem(VERBOSE_DIAGNOSTICS_KEY, String(verboseDiagnosticsExpiresAt));
			} else {
				window.localStorage.removeItem(VERBOSE_DIAGNOSTICS_KEY);
			}
		}
	} catch {
		// Verbose diagnostics still works for this session when storage is unavailable.
	}
}

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
 * Set Database collection - call when database is ready.
 * Runs log retention every time a collection is bound.
 */
export const setDatabase = (collection: any) => {
	if (collection !== dbCollection) {
		databaseEpoch += 1;
		clearRecorder();
		// A freshly bound collection deserves a clean attempt, not the previous
		// database's backoff.
		resetRecorderPromotionBackoff();
	}
	dbCollection = collection;

	if (collection) {
		void sweepLogRetention(collection).catch((error: unknown) => {
			console.error('Failed to enforce log retention', error);
		});
	}
};

export const getDatabaseEpoch = () => databaseEpoch;

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
	message = redactSensitiveText(message);

	// Redact sensitive fields and merge the typed code into context before any output.
	if (options.context || options.code) {
		const context = options.context ? redactSensitiveFields(options.context) : {};
		options = {
			...options,
			context:
				options.code && context.errorCode === undefined
					? { ...context, errorCode: options.code }
					: context,
		};
	}

	// Check if this log level should be shown (based on runtime level)
	const levelName = (level.text === 'success' ? 'info' : level.text) as LogLevel;
	const levelSeverity = LOG_LEVEL_SEVERITY[levelName] ?? 0;
	const currentSeverity = LOG_LEVEL_SEVERITY[currentLogLevel];

	// Production only sends warnings and errors to the console; toast/db remain available for all levels.
	const shouldLogToConsole =
		levelSeverity >= currentSeverity &&
		(isDevelopment() || levelName === 'warn' || levelName === 'error');

	// 1. Log to console if level permits
	if (shouldLogToConsole) {
		const timestamp = new Date().toLocaleTimeString();
		const levelText = level.text.toUpperCase();
		// Include context in console output if available (using safe stringify)
		const contextStr = options.context ? ` | Context: ${safeStringify(options.context)}` : '';
		const formattedMessage = `${timestamp} | ${levelText} : ${message}${contextStr}`;

		if (isDevelopment()) {
			// console.errors open a redbox in development which is annoying
			console.log(formattedMessage);
		} else if (levelName === 'warn') {
			console.warn(formattedMessage);
		} else {
			console.error(formattedMessage);
		}
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
			title: options.toast?.title ?? message, // New format uses 'title' not 'text1'
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

	// 3. Record debug narration, or persist info and above when a collection is bound.
	if (levelName === 'debug') {
		try {
			// Redaction above is privacy-load-bearing: only redacted context enters the ring.
			recordEvent({
				timestamp: Date.now(),
				level: 'debug',
				message,
				context: options.context ?? {},
				terminal: options.terminal,
			});
			if (dbCollection && isVerboseDiagnostics()) {
				// Forward terminal fields too: a forensic debug row (e.g. a recovered 401
				// attempt, #899) is only chainable to its refresh/success rows through
				// outcome + operationId, and dropping them here would break the chain
				// exactly where verbose diagnostics is meant to expose it.
				persistLog(dbCollection, levelName, message, options.context ?? {}, options.terminal);
			}
		} catch (error) {
			console.error('Failed to record debug log entry', error);
		}
	} else if (dbCollection) {
		try {
			const terminal: LogTerminalFields | undefined =
				level.text === 'success'
					? { ...options.terminal, outcome: options.terminal?.outcome ?? 'ok' }
					: options.terminal;
			persistLog(dbCollection, levelName, message, options.context || {}, terminal);
			if (levelName === 'error') void promoteRecorder('error');
		} catch (error) {
			console.error('Failed to persist log entry', error);
		}
	}
};

/**
 * Log Level Guidelines (full rubric: ./LEVELS.md):
 * - DEBUG: Forensic detail — internal flow, retries, transient failures that later
 *          RECOVERED (stamp `outcome: 'recovered'`); developer only, hidden in production
 * - INFO:  Lifecycle — meaningful state changes worth tracking (syncs, logins, "Session renewed")
 * - WARN:  Will need attention if it persists
 * - ERROR: Needs user action
 *
 * A level reflects how the OPERATION ended, not the loudest moment inside it —
 * the layer that sees the whole arc decides the level once the arc settles (#899).
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
	currentLogLevel = isDevelopment() ? 'debug' : 'info';
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
		promoteRecorder,
		setVerbose: setVerboseDiagnostics,
		recorderStats,
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
	protected buildOptions(
		options: LoggerOptions & { code: ErrorCode }
	): LoggerOptions & { code: ErrorCode };
	protected buildOptions(options?: LoggerOptions): LoggerOptions;
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
	 * // Lazy - deferred until the logger captures it
	 * logger.debug(() => `Cart state: ${JSON.stringify(cart.getFullState())}`);
	 * ```
	 */
	debug(message: LazyMessage, options?: LoggerOptions): void {
		// The recorder needs the rendered trail, so lazy debug messages now always resolve.
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
	error(message: LazyMessage, options: LoggerOptions & { code: ErrorCode }): void {
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

export { mapExceptionToCode } from './map-exception';
export { log, recorderStats, snapshotRecorder };
