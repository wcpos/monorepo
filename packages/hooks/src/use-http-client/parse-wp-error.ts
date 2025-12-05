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
 * This utility extracts the most useful error message for display to users.
 */

export interface WpErrorResponse {
	code?: string;
	message?: string;
	data?: {
		status?: number;
		[key: string]: any;
	};
}

export interface ParsedWpError {
	message: string;
	code: string | null;
	status: number | null;
	isWpError: boolean;
}

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
 * @returns Parsed error with message, code, and status
 */
export const parseWpError = (data: unknown, fallbackMessage: string): ParsedWpError => {
	// Not a WP error format
	if (!isWpErrorResponse(data)) {
		// Check if it's a simple string error
		if (typeof data === 'string' && data.trim()) {
			return {
				message: data,
				code: null,
				status: null,
				isWpError: false,
			};
		}

		return {
			message: fallbackMessage,
			code: null,
			status: null,
			isWpError: false,
		};
	}

	// Extract the message - prefer the 'message' field
	let message = fallbackMessage;

	if (data.message && typeof data.message === 'string') {
		message = data.message;
	}

	// Extract code and status
	const code = data.code || null;
	const status = data.data?.status || null;

	return {
		message,
		code,
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

