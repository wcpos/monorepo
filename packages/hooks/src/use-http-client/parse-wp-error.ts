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
 * and maps external error codes to our internal error code format (APIxxxxx).
 */

import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

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
	code: string | null;
	/** Original server error code (for debugging) */
	serverCode: string | null;
	/** HTTP status from server response */
	status: number | null;
	/** Whether this was a recognized WP/WC error format */
	isWpError: boolean;
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
const SERVER_CODE_TO_INTERNAL: Record<string, string> = {
	// WordPress REST API - Authentication/Authorization
	rest_forbidden: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
	rest_cannot_view: ERROR_CODES.USER_NOT_AUTHORIZED,
	rest_cannot_create: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
	rest_cannot_edit: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
	rest_cannot_delete: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
	rest_forbidden_context: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
	rest_login_required: ERROR_CODES.AUTH_REQUIRED,

	// WordPress REST API - Request errors
	rest_no_route: ERROR_CODES.RESOURCE_NOT_FOUND,
	rest_invalid_param: ERROR_CODES.INVALID_PARAMETER_VALUE,
	rest_missing_callback_param: ERROR_CODES.MISSING_REQUIRED_PARAMETERS,
	rest_invalid_json: ERROR_CODES.INVALID_REQUEST_FORMAT,

	// WooCommerce REST API - Authentication/Authorization
	woocommerce_rest_authentication_error: ERROR_CODES.INVALID_CREDENTIALS,
	woocommerce_rest_cannot_view: ERROR_CODES.USER_NOT_AUTHORIZED,
	woocommerce_rest_cannot_create: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
	woocommerce_rest_cannot_edit: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
	woocommerce_rest_cannot_delete: ERROR_CODES.INSUFFICIENT_PERMISSIONS,

	// WooCommerce REST API - Validation errors
	woocommerce_rest_invalid_id: ERROR_CODES.INVALID_PARAMETER_VALUE,
	woocommerce_rest_product_invalid_id: ERROR_CODES.INVALID_PARAMETER_VALUE,
	woocommerce_rest_customer_invalid_id: ERROR_CODES.INVALID_PARAMETER_VALUE,
	woocommerce_rest_order_invalid_id: ERROR_CODES.INVALID_PARAMETER_VALUE,
	woocommerce_rest_invalid_product_sku: ERROR_CODES.INVALID_PARAMETER_VALUE,
	woocommerce_rest_invalid_image: ERROR_CODES.INVALID_PARAMETER_VALUE,

	// JWT Auth plugin
	jwt_auth_failed: ERROR_CODES.INVALID_CREDENTIALS,
	jwt_auth_invalid_token: ERROR_CODES.TOKEN_INVALID,
	jwt_auth_expired_token: ERROR_CODES.TOKEN_EXPIRED,
	jwt_auth_bad_iss: ERROR_CODES.TOKEN_INVALID,
	jwt_auth_bad_request: ERROR_CODES.INVALID_REQUEST_FORMAT,
	jwt_auth_bad_config: ERROR_CODES.INVALID_SITE_CONFIGURATION,
	jwt_auth_no_auth_header: ERROR_CODES.AUTH_REQUIRED,
};

/**
 * Maps a server error code to our internal error code format.
 *
 * @param serverCode - The error code from the server (e.g., "woocommerce_rest_cannot_view")
 * @param httpStatus - Optional HTTP status code for fallback mapping
 * @returns Internal error code (e.g., "API02004") or null if no mapping exists
 */
export const mapToInternalCode = (
	serverCode: string | null | undefined,
	httpStatus?: number | null
): string | null => {
	// Try direct mapping first
	if (serverCode && SERVER_CODE_TO_INTERNAL[serverCode]) {
		return SERVER_CODE_TO_INTERNAL[serverCode];
	}

	// Fallback: map based on HTTP status if no direct mapping
	if (httpStatus) {
		switch (httpStatus) {
			case 400:
				return ERROR_CODES.INVALID_REQUEST_FORMAT;
			case 401:
				return ERROR_CODES.AUTH_REQUIRED;
			case 403:
				return ERROR_CODES.INSUFFICIENT_PERMISSIONS;
			case 404:
				return ERROR_CODES.RESOURCE_NOT_FOUND;
			case 429:
				return ERROR_CODES.RATE_LIMIT_EXCEEDED;
			case 500:
			case 502:
			case 503:
			case 504:
				return ERROR_CODES.SERVICE_UNAVAILABLE;
		}
	}

	return null;
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
		message = data.message;
	}

	// Extract server code and status
	const serverCode = data.code || null;
	const status = data.data?.status || null;

	// Map to internal code for user-facing display
	const code = mapToInternalCode(serverCode, status);

	return {
		message,
		code,
		serverCode,
		status,
		isWpError: true,
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
