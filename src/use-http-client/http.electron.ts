/**
 * Wrapper for Axios run on electron main thread
 */
type AxiosRequestConfig = import('axios').AxiosRequestConfig;
type AxiosInstance = import('axios').AxiosInstance;

/**
 *
 */
const axiosOnElectronMain = {
	create: (instanceConfig) => {
		let instanceID: string;

		window.ipcRenderer
			.invoke('axios', {
				type: 'create',
				config: instanceConfig,
			})
			.then((result) => {
				instanceID = result;
			});

		return {
			request: (config: AxiosRequestConfig = {}) => {
				return new Promise((resolve, reject) => {
					window.ipcRenderer
						.invoke('axios', {
							type: 'request',
							instanceID,
							config,
						})
						.then((response) => {
							if (response.status) {
								resolve(response);
							} else {
								reject(response);
							}
						});
				});
			},
		};
	},
};

export default axiosOnElectronMain;
