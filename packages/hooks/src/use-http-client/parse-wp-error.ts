/**
 * Parse WordPress/WooCommerce REST API error responses
 *
 * WordPress and WooCommerce return errors in this format:
 * {
 *   "code": "woocommerce_rest_cannot_view",
 *   "message": "Sorry, you cannot view this resource.",
 *   "data": {
 *     "status": 401
 *   }
 * }
 *
 * This utility extracts the most useful error message for display to users
 * and maps external error codes to our evidence-backed internal domains.
 */

import { ERROR_CODES, ErrorCode } from '@wcpos/utils/logger/generated/error-codes.generated';

export interface WpErrorResponse {
	code?: string;
	message?: string;
	data?: {
		status?: number;
		[key: string]: any;
	};
}

export interface ParsedWpError {
	/** User-friendly error message */
	message: string;
	/** Internal error code (APIxxxxx format) for docs/help link */
	code: ErrorCode | null;
	/** Original server error code (for debugging) */
	serverCode: string | null;
	/** HTTP status from server response */
	status: number | null;
	/** Whether this was a recognized WP/WC error format */
	isWpError: boolean;
	/** Whether an unmapped server code needs classification */
	triage?: true;
}

/**
 * Maps external server error codes to internal error codes.
 *
 * This allows us to:
 * 1. Show consistent error codes to users across different backends
 * 2. Link to our documentation with specific help for each error
 * 3. Keep original server codes in logs for debugging
 *
 * The mapping covers:
 * - WordPress REST API errors (rest_*)
 * - WooCommerce REST API errors (woocommerce_rest_*)
 * - JWT Auth plugin errors (jwt_auth_*)
 */
const SERVER_CODE_TO_INTERNAL: Record<string, ErrorCode> = {
	// WordPress REST API - Authentication/Authorization
	rest_forbidden: ERROR_CODES.INSUFFICIENT_ROLE,
	rest_cannot_view: ERROR_CODES.INSUFFICIENT_ROLE,
	rest_cannot_create: ERROR_CODES.INSUFFICIENT_ROLE,
	rest_cannot_edit: ERROR_CODES.INSUFFICIENT_ROLE,
	rest_cannot_delete: ERROR_CODES.INSUFFICIENT_ROLE,
	rest_forbidden_context: ERROR_CODES.INSUFFICIENT_ROLE,
	rest_login_required: ERROR_CODES.SESSION_EXPIRED,

	// WordPress REST API - Request errors
	rest_no_route: ERROR_CODES.REST_ROUTE_MISSING,
	rest_invalid_param: ERROR_CODES.RECORD_INVALID_FIELD,
	rest_missing_callback_param: ERROR_CODES.RECORD_INVALID_FIELD,
	rest_invalid_json: ERROR_CODES.RECORD_INVALID_FIELD,

	// WooCommerce REST API - Authentication/Authorization
	woocommerce_pos_rest_forbidden: ERROR_CODES.INSUFFICIENT_ROLE,
	woocommerce_rest_authentication_error: ERROR_CODES.SESSION_EXPIRED,
	woocommerce_rest_cannot_view: ERROR_CODES.INSUFFICIENT_ROLE,
	woocommerce_rest_cannot_create: ERROR_CODES.INSUFFICIENT_ROLE,
	woocommerce_rest_cannot_edit: ERROR_CODES.INSUFFICIENT_ROLE,
	woocommerce_rest_cannot_delete: ERROR_CODES.INSUFFICIENT_ROLE,

	// WooCommerce REST API - Validation errors
	woocommerce_rest_invalid_id: ERROR_CODES.RECORD_INVALID_FIELD,
	woocommerce_rest_product_invalid_id: ERROR_CODES.RECORD_INVALID_FIELD,
	woocommerce_rest_customer_invalid_id: ERROR_CODES.RECORD_INVALID_FIELD,
	woocommerce_rest_order_invalid_id: ERROR_CODES.RECORD_INVALID_FIELD,
	woocommerce_rest_invalid_product_sku: ERROR_CODES.RECORD_INVALID_FIELD,
	woocommerce_rest_invalid_image: ERROR_CODES.RECORD_INVALID_FIELD,

	// JWT Auth plugin
	jwt_auth_failed: ERROR_CODES.SESSION_EXPIRED,
	jwt_auth_invalid_token: ERROR_CODES.SESSION_EXPIRED,
	jwt_auth_expired_token: ERROR_CODES.SESSION_EXPIRED,
	jwt_auth_bad_iss: ERROR_CODES.SESSION_EXPIRED,
	jwt_auth_bad_request: ERROR_CODES.RECORD_INVALID_FIELD,
	jwt_auth_bad_config: ERROR_CODES.AUTH_PLUGIN_CONFLICT,
	jwt_auth_no_auth_header: ERROR_CODES.SESSION_EXPIRED,

	// WCPOS protocol gate — the server's deliberate upgrade refusal
	// (wcpos/woocommerce-pos#1752). The sync engine renders the blocking
	// screen; this mapping covers the axios lanes (checkout, refunds).
	wcpos_update_required: ERROR_CODES.APP_UPDATE_REQUIRED,
};

/**
 * Maps a server error code to our internal error code format.
 *
 * @param serverCode - The error code from the server (e.g., "woocommerce_rest_cannot_view")
 * @param httpStatus - Optional HTTP status code for fallback mapping
 * @returns Internal error code or null when there is no server code or status
 */
export const mapToInternalCode = (
	serverCode: string | null | undefined,
	httpStatus?: number | null
): ErrorCode | null => {
	// Try direct mapping first
	if (serverCode && SERVER_CODE_TO_INTERNAL[serverCode]) {
		return SERVER_CODE_TO_INTERNAL[serverCode];
	}

	// Fallback: map based on HTTP status if no direct mapping
	if (httpStatus) {
		switch (httpStatus) {
			case 400:
				return ERROR_CODES.RECORD_INVALID_FIELD;
			case 401:
				return ERROR_CODES.SESSION_EXPIRED;
			case 403:
				return ERROR_CODES.INSUFFICIENT_ROLE;
			case 404:
				return ERROR_CODES.REST_ROUTE_MISSING;
			case 429:
				return ERROR_CODES.STORE_RATE_LIMITED;
			default:
				// A 5xx means the store WAS reached and its server failed. Attributing
				// that to the client ("WCPOS encountered an unexpected error") is the
				// misleading-code failure mode the mined corpora call out: the merchant
				// blames the POS for their own site's fault and the safe action —
				// check the site's error log — never surfaces. It is also distinct from
				// SYNC_UNREACHABLE, which means the store could not be reached at all.
				if (httpStatus >= 500) return ERROR_CODES.STORE_SERVER_ERROR;
				return ERROR_CODES.UNEXPECTED_ERROR;
		}
	}

	return serverCode ? ERROR_CODES.UNEXPECTED_ERROR : null;
};

/**
 * The PHP error behind a WordPress fatal, when the 500 body carries one.
 *
 * WordPress answers a fatal (memory exhausted, a plugin's uncaught exception)
 * with `{ code: 'internal_server_error', message: '<p>There has been a critical
 * error on this website.</p>…', data: { status: 500, error: { type, message,
 * file, line } } }`. The top-level `message` is localized boilerplate that names
 * nothing; `data.error` is PHP's `error_get_last()` and names the cause —
 * "Allowed memory size of 134217728 bytes exhausted" — so it is the sentence to
 * show, with `file:line` appended the way PHP reports a fatal. It is present
 * only when the site exposes error details, so callers keep their fallback
 * (#2439). `readServerMessage` in `@wcpos/sync-core` reads the same shape for the
 * push lane; sync-core stays dependency-free, so the two are kept in step by hand.
 *
 * @param data - The WP error's `data` member (or any object carrying `error`)
 */
export const readWpFatalDetail = (data: unknown): string | undefined => {
	if (data === null || typeof data !== 'object') return undefined;
	const error = (data as Record<string, unknown>).error;
	if (error === null || typeof error !== 'object') return undefined;
	const { message: raw, file, line } = error as Record<string, unknown>;
	if (typeof raw !== 'string') return undefined;
	const firstLine = stripTags(raw.split('\n')[0] ?? '');
	if (firstLine === '') return undefined;
	const location = typeof file === 'string' && file !== '' ? fatalLocation(file, line) : '';
	const budget = Math.max(QUOTE_CAP - location.length, MIN_MESSAGE_CHARS);
	const message = firstLine.length > budget ? `${firstLine.slice(0, budget - 1)}…` : firstLine;
	return `${message}${location}`;
};

/**
 * The ledger observer (`sanitizeReason`) caps a quoted sentence at 200
 * characters, cutting from the END — exactly where the location is appended.
 * The whole sentence is therefore built to fit under it: the location is sized
 * first (shortened to its file name when even the WordPress-relative path is
 * long), and the PHP message takes whatever is left. A fatal's first line is a
 * sentence, but an uncaught exception's `message` runs on into a stack trace,
 * so only the first line is quoted.
 */
const QUOTE_CAP = 200;
/** The location may not squeeze the message below this; past it the path drops to its file name. */
const MIN_MESSAGE_CHARS = 80;

/**
 * ` in wp-includes/class-wpdb.php:2324`. Everything before the WordPress root
 * (`/home/u123/domains/shop.example/public_html/`) is the host's directory
 * layout, which says nothing about the fault and eats the quote budget, so the
 * path starts at `wp-content/`, `wp-includes/` or `wp-admin/`; a path outside
 * those roots, or one still too long to leave the message its minimum, keeps
 * only its file name — the line number always survives.
 */
const fatalLocation = (file: string, line: unknown): string => {
	const suffix =
		typeof line === 'number' || (typeof line === 'string' && line !== '') ? `:${line}` : '';
	// A Windows host reports `C:\inetpub\wwwroot\wp-includes\class-wpdb.php`.
	const path = file.split('\\').join('/');
	const slash = path.lastIndexOf('/');
	const fileName = slash === -1 ? path : path.slice(slash + 1);
	const maxLocation = QUOTE_CAP - MIN_MESSAGE_CHARS;
	for (const root of ['/wp-content/', '/wp-includes/', '/wp-admin/']) {
		const at = path.indexOf(root);
		if (at === -1) continue;
		const location = ` in ${path.slice(at + 1)}${suffix}`;
		if (location.length <= maxLocation) return location;
		break;
	}
	const location = ` in ${fileName}${suffix}`;
	if (location.length <= maxLocation) return location;
	// Even the file name is absurd: keep its tail (extension) and the line number.
	const room = maxLocation - ` in …${suffix}`.length;
	return ` in …${fileName.slice(fileName.length - room)}${suffix}`;
};

/**
 * WordPress ships its error copy as HTML — the critical-error boilerplate is
 * `<p>…</p><p><a href="…">Learn more…</a></p>` — and the sentence lands in toasts
 * and ledger rows, where tags would render literally. Entities are left alone:
 * the renderer decodes them.
 */
// Longest tag WordPress error copy emits is the troubleshooting link (~90 chars).
const TAG_MAX = 256;
const TAG_START = /[A-Za-z/!]/;
// Tag names WordPress and WooCommerce put in error copy, plus HTML comments.
// Attributes must be `name=value`: `and`/`z` are bare attribute names in HTML too, so
// `x<a and z>2` would otherwise read as an `<a>` tag and lose the sentence's middle.
const KNOWN_TAG =
	/^(?:\/?(?:p|a|br|b|strong|i|em|u|code|pre|span|div|ul|ol|li|h[1-6])(?:\s+[A-Za-z_:][A-Za-z0-9:._-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=`]+))*\s*\/?|!--[\s\S]*--|!\[CDATA\[[\s\S]*\]\])$/i;

const stripTags = (html: string): string => {
	// A linear scan rather than a `<[^>]*>` regex: on server-controlled input that
	// regex is polynomial on a run of `<` (CodeQL js/polynomial-redos), and the
	// scan keeps a lone `<` with no closing `>` as the literal it is.
	let text = '';
	let cursor = 0;
	while (cursor < html.length) {
		const open = html.indexOf('<', cursor);
		if (open === -1) {
			text += html.slice(cursor);
			break;
		}
		// Only tag syntax opens a tag: `<p`, `</p>`, `<!-- -->`. A `<` before a space,
		// a digit, another `<` or the end of the text is a comparison operator in a
		// PHP sentence ("Expected x < 5 and y > 2") and is kept, with its `>`.
		if (!TAG_START.test(html.charAt(open + 1))) {
			text += html.slice(cursor, open + 1);
			cursor = open + 1;
			continue;
		}
		// Look for the closing `>` only within TAG_MAX chars, so a crafted body of
		// `<a<a<a…>` costs a bounded window per `<` and the scan stays linear.
		const window = html.slice(open + 1, open + 1 + TAG_MAX);
		const closeInWindow = window.indexOf('>');
		// The run between `<` and `>` must be one of the tags WordPress's error copy
		// uses (or a comment); `x<y and z>2` is a sentence, not markup, and is kept.
		if (closeInWindow === -1 || !KNOWN_TAG.test(window.slice(0, closeInWindow))) {
			text += html.slice(cursor, open + 1);
			cursor = open + 1;
			continue;
		}
		text += `${html.slice(cursor, open)} `;
		cursor = open + 1 + closeInWindow + 1;
	}
	return text.replace(/\s+/g, ' ').trim();
};

/**
 * Check if the response data looks like a WordPress/WooCommerce error
 */
export const isWpErrorResponse = (data: unknown): data is WpErrorResponse => {
	if (!data || typeof data !== 'object') {
		return false;
	}

	const wpError = data as WpErrorResponse;

	// WP/WC errors typically have a 'code' and 'message' field
	// Some also have 'data.status'
	return Boolean(
		(wpError.code && typeof wpError.code === 'string') ||
		(wpError.message && typeof wpError.message === 'string')
	);
};

/**
 * Parse a WordPress/WooCommerce error response and extract the message
 *
 * @param data - The response data from an HTTP error
 * @param fallbackMessage - Message to use if no WP error message found
 * @returns Parsed error with message, internal code, server code, and status
 */
export const parseWpError = (data: unknown, fallbackMessage: string): ParsedWpError => {
	// Not a WP error format
	if (!isWpErrorResponse(data)) {
		// Check if it's a simple string error
		if (typeof data === 'string' && data.trim()) {
			return {
				message: data,
				code: null,
				serverCode: null,
				status: null,
				isWpError: false,
			};
		}

		return {
			message: fallbackMessage,
			code: null,
			serverCode: null,
			status: null,
			isWpError: false,
		};
	}

	// Extract the message - prefer the 'message' field
	let message = fallbackMessage;

	if (data.message && typeof data.message === 'string') {
		// WP REST error copy may be HTML (the critical-error boilerplate is); this
		// string is shown in toasts, so tags go, entities stay for the renderer.
		const plain = stripTags(data.message);
		if (plain !== '') message = plain;
	}

	// Extract server code and status
	const rawServerCode = typeof data.code === 'string' ? data.code : null;
	const serverCode =
		rawServerCode === null || /^[A-Za-z0-9_.:\-]{1,64}$/.test(rawServerCode)
			? rawServerCode
			: 'invalid_server_code';
	const status = data.data?.status ?? null;

	// A WordPress fatal names its cause in `data.error`, not in `message` — see
	// `readWpFatalDetail`. The PHP error wins over the critical-error boilerplate,
	// but only on a 5xx: a 4xx may carry a caller-defined `data.error` object of
	// its own (a gateway diagnostic under a validation message), and there the
	// top-level message is the one written for the cashier.
	const fatal =
		typeof status === 'number' && status >= 500 ? readWpFatalDetail(data.data) : undefined;
	if (fatal !== undefined) {
		message = fatal;
	}

	// Map to internal code for user-facing display
	const code = mapToInternalCode(serverCode, status);
	const triage = Boolean(serverCode && !SERVER_CODE_TO_INTERNAL[serverCode]);

	return {
		message,
		code,
		serverCode,
		status,
		isWpError: true,
		...(triage && { triage: true as const }),
	};
};

/**
 * Extract error message from any HTTP error response
 * Tries WordPress format first, falls back to common patterns
 *
 * @param responseData - The error response data
 * @param fallbackMessage - Default message if none found
 * @returns The best error message to display
 */
export const extractErrorMessage = (responseData: unknown, fallbackMessage: string): string => {
	// Try WordPress/WooCommerce format first
	const wpError = parseWpError(responseData, fallbackMessage);
	if (wpError.isWpError) {
		return wpError.message;
	}

	// Try common error response patterns
	if (responseData && typeof responseData === 'object') {
		const data = responseData as Record<string, unknown>;

		// Try various common message fields
		if (typeof data.message === 'string' && data.message) {
			return data.message;
		}
		if (typeof data.error === 'string' && data.error) {
			return data.error;
		}
		// WordPress's own shape for a fatal is an OBJECT under `error`
		// ({ type, message, file, line }); the string case above never matched it.
		const fatal = readWpFatalDetail(data);
		if (fatal !== undefined) {
			return fatal;
		}
		if (typeof data.error_description === 'string' && data.error_description) {
			return data.error_description;
		}
		if (typeof data.errors === 'object' && data.errors) {
			// Handle validation errors array
			const errors = data.errors as Record<string, unknown>;
			const firstError = Object.values(errors)[0];
			if (Array.isArray(firstError) && firstError[0]) {
				return String(firstError[0]);
			}
			if (typeof firstError === 'string') {
				return firstError;
			}
		}
	}

	return fallbackMessage;
};

/**
 * Extract WordPress error code from response
 * Useful for programmatic error handling
 */
export const extractWpErrorCode = (responseData: unknown): string | null => {
	if (!isWpErrorResponse(responseData)) {
		return null;
	}
	return responseData.code || null;
};
