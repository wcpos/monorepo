/**
 * The transport facts a diagnosis actually needs, pulled off an axios-shaped rejection.
 *
 * The register outbox used to log `logger.warn('Register session outbox request failed')` with
 * none of this attached, so an expanded log row carried nothing but a category — you could not
 * tell a 401 from a refused field from a storage fault.
 *
 * `data.params` is the offending field name, which the plugin returns alongside
 * `rest_invalid_param` (woocommerce-pos: Sessions_Controller::error).
 */
export function failureFacts(error: unknown) {
	const failure = error as {
		message?: string;
		response?: {
			status?: number;
			data?: {
				code?: string;
				message?: string;
				data?: {
					status?: number;
					session_id?: string;
					closure_id?: string;
					params?: Record<string, string>;
				};
			};
		};
	};
	const body = failure.response?.data;
	return {
		status: failure.response?.status,
		body,
		errorCode: body?.code,
		field: Object.keys(body?.data?.params ?? {})[0],
		// The store's own explanation first. Axios overwrites `failure.message` with generic
		// transport text ("Request failed with status code 400"), so preferring it would put
		// the one useless sentence on the row and drop the one that says what was wrong.
		message: body?.message ?? failure.message,
	};
}
