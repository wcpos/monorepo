/**
 * Logger constants for error code documentation
 */

/**
 * Base URL for error code documentation
 * Used in logs UI and toast notifications
 */
export const ERROR_CODE_DOCS_BASE_URL = 'https://docs.wcpos.com/error-codes';

/**
 * Get the full documentation URL for a specific error code
 */
export const getErrorCodeDocURL = (errorCode: string): string => {
	return `${ERROR_CODE_DOCS_BASE_URL}/${errorCode}`;
};
