/**
 * Wrapper for Axios run on electron main thread
 */
type AxiosRequestConfig = import('axios').AxiosRequestConfig;

/**
 *
 */
const axiosOnElectronMain = {
	request: (config: AxiosRequestConfig = {}) => {
		return new Promise((resolve, reject) => {
			window.ipcRenderer
				.invoke('axios', {
					type: 'request',
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

export default axiosOnElectronMain;
