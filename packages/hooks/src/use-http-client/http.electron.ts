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
				.then((result) => {
					if (result.code) {
						reject(result);
					} else {
						resolve(result);
					}
				});
		});
	},
};

export default axiosOnElectronMain;
