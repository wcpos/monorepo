/**
 * Electron HTTP Adapter
 *
 * This module bridges HTTP requests from the renderer process (React Native) to the
 * main process (Node.js) via Electron's IPC mechanism.
 *
 * ## Why IPC?
 * In Electron, the renderer process runs in a sandboxed Chromium environment. While it
 * CAN make HTTP requests directly, routing through the main process provides:
 * - Better cookie/session handling
 * - Access to Node.js networking features
 * - Consistent behavior with native Node.js axios
 *
 * ## IPC Serialization Boundary
 * Data crossing IPC must be JSON-serializable. This means:
 *
 * **CAN cross IPC:**
 * - Primitive types (string, number, boolean, null)
 * - Plain objects and arrays
 * - Response data, status, headers
 *
 * **CANNOT cross IPC:**
 * - Class instances (prototype chain is lost)
 * - Functions
 * - Circular references
 * - Node.js objects (http.ClientRequest, etc.)
 *
 * ## Error Handling
 * Since AxiosError instances can't cross IPC, we:
 * 1. Main process: Serialize error properties to plain object
 * 2. Renderer: Reconstruct AxiosError using constructor
 *
 * This preserves instanceof checks and error.response?.status access.
 *
 * ## Promise Rejection Timing (queueMicrotask)
 * React Native's global error handler can intercept promise rejections before our
 * catch handlers run, causing Redbox errors. We use queueMicrotask() to defer
 * rejections until the promise chain is fully established.
 *
 * @see apps/electron/src/main/axios.ts - Main process handler
 * @see README.md - Full architecture documentation
 */

import { AxiosError, CanceledError, isCancel } from 'axios';

import type { AxiosRequestConfig } from 'axios';

declare global {
	interface Window {
		ipcRenderer: {
			invoke: (channel: string, data?: any) => Promise<any>;
		};
	}
}

/**
 * IPC Response Contract - Success
 *
 * @example
 * {
 *   success: true,
 *   data: { ... },
 *   status: 200,
 *   statusText: 'OK',
 *   headers: { 'content-type': 'application/json' }
 * }
 */
interface IpcSuccessResponse {
	success: true;
	data: any;
	status: number;
	statusText: string;
	headers: Record<string, string>;
}

/**
 * IPC Response Contract - Error
 *
 * @example
 * {
 *   success: false,
 *   name: 'AxiosError',
 *   message: 'Request failed with status code 401',
 *   code: 'ERR_BAD_REQUEST',
 *   response: {
 *     status: 401,
 *     statusText: 'Unauthorized',
 *     data: { code: 'jwt_auth_invalid_token', message: 'Token expired' }
 *   }
 * }
 */
interface IpcErrorResponse {
	success: false;
	name: string;
	message: string;
	code?: string;
	config?: any;
	request?: any;
	response?: {
		status: number;
		statusText: string;
		data: any;
		headers: Record<string, string>;
	};
}

type IpcResponse = IpcSuccessResponse | IpcErrorResponse;

/**
 * Defer promise rejection to the next microtask.
 *
 * This prevents React Native's global error handler from showing a Redbox
 * before our catch handlers have a chance to process the error.
 *
 * Without this, the rejection can propagate before the promise chain
 * (useHttpClient → processErrorHandlers → catch) is fully established.
 */
const deferReject = (reject: (error: any) => void, error: any) => {
	queueMicrotask(() => reject(error));
};

/**
 * Reconstruct an AxiosError from serialized IPC response.
 *
 * This ensures that:
 * - `error instanceof AxiosError` returns true
 * - `error.response?.status` is accessible
 * - `error.code` contains the axios error code
 *
 * The reconstructed error behaves identically to a native axios error,
 * so downstream error handlers don't need Electron-specific logic.
 */
const toAxiosError = (result: IpcErrorResponse): AxiosError => {
	return new AxiosError(
		result.message,
		result.code,
		result.config,
		result.request,
		result.response as any
	);
};

/**
 * Setup request cancellation via AbortSignal or CancelToken.
 *
 * Since the actual HTTP request runs in the main process, we need to
 * send an IPC message to trigger cancellation there.
 *
 * @param requestId - Unique ID to identify this request for cancellation
 * @param signal - AbortSignal from AbortController
 * @param cancelToken - Axios CancelToken (legacy, but still supported)
 * @returns CanceledError if already aborted, null otherwise
 */
const setupCancellation = (
	requestId: string,
	signal?: AbortSignal | null,
	cancelToken?: any
): CanceledError<any> | null => {
	// Handle pre-aborted signal
	if (signal?.aborted) {
		return new CanceledError<any>('canceled');
	}

	// Setup abort listener - sends IPC message to main process
	if (signal) {
		signal.addEventListener('abort', () => {
			window.ipcRenderer.invoke('axios', { type: 'cancel', requestId });
		});
	}

	// Legacy CancelToken support
	if (cancelToken) {
		cancelToken.promise.then(() => {
			window.ipcRenderer.invoke('axios', { type: 'cancel', requestId });
		});
	}

	return null;
};

/**
 * Make an HTTP request via IPC to the main process.
 *
 * Flow:
 * 1. Generate unique requestId for cancellation tracking
 * 2. Extract non-serializable config properties (signal, cancelToken)
 * 3. Send serializable config to main process
 * 4. Main process executes request, returns serialized response/error
 * 5. Reconstruct AxiosError if needed
 * 6. Resolve/reject with deferred timing
 */
const request = (config: AxiosRequestConfig = {}): Promise<any> => {
	const requestId = crypto.randomUUID();
	const { signal, cancelToken, ...configToSend } = config;

	// Check for pre-aborted signal before sending IPC
	const abortError = setupCancellation(requestId, signal as AbortSignal | undefined, cancelToken);
	if (abortError) {
		return Promise.reject(abortError);
	}

	return new Promise((resolve, reject) => {
		window.ipcRenderer
			.invoke('axios', { type: 'request', requestId, config: configToSend })
			.then((result: IpcResponse) => {
				if (result.success === false) {
					// Reconstruct appropriate error type
					const error =
						result.code === 'ERR_CANCELED' || result.name === 'CanceledError'
							? new CanceledError(result.message)
							: toAxiosError(result);

					// Defer rejection to prevent Redbox
					deferReject(reject, error);
					return;
				}

				// Success - extract response without 'success' flag
				const { success, ...response } = result;
				resolve(response);
			})
			.catch((err) => deferReject(reject, err));
	});
};

export const http = { request, isCancel };
