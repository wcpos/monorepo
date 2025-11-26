/**
 * Wrapper for Axios run on electron main thread
 */
import { CanceledError, isCancel } from 'axios';

type AxiosRequestConfig = import('axios').AxiosRequestConfig;

// Extend the Window interface to include ipcRenderer
declare global {
	interface Window {
		ipcRenderer: {
			invoke: (channel: string, data?: any) => Promise<any>;
		};
	}
}

/**
 *
 */
const axiosOnElectronMain = {
	request: (config: AxiosRequestConfig = {}) => {
		const requestId = crypto.randomUUID();
		const { signal, cancelToken, ...configToSend } = config;

		// Handle AbortSignal (modern)
		if (signal) {
			if (signal.aborted) {
				return Promise.reject(new CanceledError('canceled'));
			}

			signal.addEventListener('abort', () => {
				window.ipcRenderer.invoke('axios', {
					type: 'cancel',
					requestId,
				});
			});
		}

		// Handle CancelToken (legacy axios)
		if (cancelToken) {
			cancelToken.promise.then(() => {
				window.ipcRenderer.invoke('axios', {
					type: 'cancel',
					requestId,
				});
			});
		}

		return window.ipcRenderer
			.invoke('axios', {
				type: 'request',
				requestId,
				config: configToSend,
			})
			.then((result: any) => {
				if (result.success === false) {
					// Check if the error is a cancellation
					if (result.code === 'ERR_CANCELED' || result.name === 'CanceledError') {
						const error = new CanceledError(result.message);
						error.code = result.code;
						// error.name is read-only and set by constructor
						throw error;
					}

					// Create an Error object that behaves like an AxiosError
					const error = new Error(result.message) as any;
					error.name = result.name;
					error.code = result.code;
					error.config = result.config;
					error.request = result.request;
					error.response = result.response;
					error.isAxiosError = result.isAxiosError;
					
					// Return rejected promise instead of throwing to ensure correct promise chain behavior
					return Promise.reject(error);
				}
				// Remove the success flag from successful responses
				const { success, ...response } = result;
				return response;
			});
	},
	isCancel,
};

export default axiosOnElectronMain;
