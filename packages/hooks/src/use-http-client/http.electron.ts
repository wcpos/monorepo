/**
 * Axios wrapper for Electron - proxies requests through IPC to the main process.
 *
 * NOTE: We use queueMicrotask() for rejections to prevent React Native's global
 * error handler from showing a Redbox before our catch handlers can process the error.
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
 * Helper to defer rejection to next microtask, preventing premature Redbox in React Native
 */
const deferReject = (reject: (error: any) => void, error: any) => {
	queueMicrotask(() => reject(error));
};

/**
 * Reconstruct an AxiosError from serialized IPC response
 */
const toAxiosError = (result: any): AxiosError => {
	return new AxiosError(
		result.message,
		result.code,
		result.config,
		result.request,
		result.response
	);
};

/**
 * Setup request cancellation via AbortSignal or CancelToken
 */
const setupCancellation = (
	requestId: string,
	signal?: AbortSignal | null,
	cancelToken?: any
): CanceledError<any> | null => {
	if (signal?.aborted) {
		return new CanceledError<any>('canceled');
	}

	if (signal) {
		signal.addEventListener('abort', () => {
			window.ipcRenderer.invoke('axios', { type: 'cancel', requestId });
		});
	}

	if (cancelToken) {
		cancelToken.promise.then(() => {
			window.ipcRenderer.invoke('axios', { type: 'cancel', requestId });
		});
	}

	return null;
};

/**
 * Main request function
 */
const request = (config: AxiosRequestConfig = {}): Promise<any> => {
	const requestId = crypto.randomUUID();
	const { signal, cancelToken, ...configToSend } = config;

	// Check for pre-aborted signal
	const abortError = setupCancellation(requestId, signal as AbortSignal | undefined, cancelToken);
	if (abortError) {
		return Promise.reject(abortError);
	}

	return new Promise((resolve, reject) => {
		window.ipcRenderer
			.invoke('axios', { type: 'request', requestId, config: configToSend })
			.then((result: any) => {
				if (result.success === false) {
					const error =
						result.code === 'ERR_CANCELED' || result.name === 'CanceledError'
							? new CanceledError(result.message)
							: toAxiosError(result);

					deferReject(reject, error);
					return;
				}

				const { success, ...response } = result;
				resolve(response);
			})
			.catch((err) => deferReject(reject, err));
	});
};

export default { request, isCancel };
