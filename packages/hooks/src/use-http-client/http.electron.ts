/**
 * Wrapper for Axios run on electron main thread
 */
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
		return window.ipcRenderer
			.invoke('axios', {
				type: 'request',
				config,
			})
			.then((result: any) => {
				if (result.success === false) {
					// Create an Error object that behaves like an AxiosError
					const error = new Error(result.message) as any;
					error.name = result.name;
					error.code = result.code;
					error.config = result.config;
					error.request = result.request;
					error.response = result.response;
					error.isAxiosError = result.isAxiosError;
					throw error;
				}
				// Remove the success flag from successful responses
				const { success, ...response } = result;
				return response;
			});
	},
};

export default axiosOnElectronMain;
