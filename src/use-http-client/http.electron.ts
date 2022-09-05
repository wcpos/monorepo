/**
 * Wrapper for Axios run on electron main thread
 */
import axios, { AxiosInstance, AxiosRequestConfig, CancelTokenSource, AxiosResponse } from 'axios';

/**
 *
 */
class AxiosWrapper {
	static DEFAULT_TIMEOUT = 60000;

	constructor(options = {}) {
		// const { config = {}, apiEndpoint = '/api', collector = {} } = options;

		// const axiosConfig: AxiosRequestConfig = {
		// 	xsrfCookieName: '',
		// 	timeout: AxiosWrapper.DEFAULT_TIMEOUT,
		// 	withCredentials: true,
		// 	...config,
		// };

		// this._axios = axios.create(axiosConfig);
		// this._axios.defaults.headers = cloneDeep(this._axios.defaults.headers);

		this.interceptors = {
			request: {
				use: () => {},
			},
			response: {
				use: () => {},
			},
		};
	}

	// setApiEndpoint = (endpoint = '') => {
	// 	let preparedEndpoint = endpoint;

	// 	if (typeof location !== 'undefined') {
	// 		preparedEndpoint = preparedEndpoint.replace('%CURRENT_HOST%', location.host);
	// 	}

	// 	this.apiEndpoint = preparedEndpoint;
	// };

	// setCSRFToken = (token: string) => {
	// 	this._axios.defaults.headers.post['X-CSRF-Token'] = token;
	// 	this._axios.defaults.headers.put['X-CSRF-Token'] = token;
	// 	this._axios.defaults.headers.delete['X-CSRF-Token'] = token;
	// };

	// setDefaultHeader = ({
	// 	name,
	// 	value,
	// 	methods,
	// }: {
	// 	name: string;
	// 	value: string;
	// 	methods?: string[];
	// }) => {
	// 	const { headers } = this._axios.defaults;
	// 	if (Array.isArray(methods)) {
	// 		methods.forEach((method) => {
	// 			if (headers[method]) {
	// 				headers[method][name] = value;
	// 			}
	// 		});
	// 	} else {
	// 		headers.common[name] = value;
	// 	}
	// };

	async request<T = any>(config: AxiosRequestConfig): Promise<T> {
		// const { method, url, data = null, params } = config;

		try {
			const response = await window.ipcRenderer.invoke('axios', {
				type: 'request',
				config,
			});

			return response;
		} catch (thrown: any) {
			if (axios.isCancel(thrown)) {
				throw { isCancelled: true, error: thrown };
			} else {
				// this.clearRequestToken(concurrentId);
			}

			let errorResponse;
			if (thrown.response) {
				errorResponse = thrown.response;
			} else if (typeof thrown.toJSON === 'function') {
				errorResponse = thrown.toJSON();
			} else {
				errorResponse = thrown;
			}
		}
	}

	get(url: string, config: AxiosRequestConfig = {}) {
		console.log({
			...config,
			method: 'HEAD',
			url,
			data: (config || {}).data,
		});
		return this.request({
			...config,
			method: 'GET',
			url,
			data: (config || {}).data,
		});
	}

	post(url: string, config: AxiosRequestConfig = {}) {
		/**
		 * @TODO - 'Content-Type': 'multipart/form-data'
		 */
		return this.request({
			...config,
			method: 'POST',
			url,
			data: (config || {}).data,
		});
	}

	put(url: string, config: AxiosRequestConfig = {}) {
		/**
		 * @TODO - 'Content-Type': 'multipart/form-data'
		 */
		return this.request({
			...config,
			method: 'PUT',
			url,
			data: (config || {}).data,
		});
	}

	patch(url: string, config: AxiosRequestConfig = {}) {
		/**
		 * @TODO - 'Content-Type': 'multipart/form-data'
		 */
		return this.request({
			...config,
			method: 'PATCH',
			url,
			data: (config || {}).data,
		});
	}

	delete(url: string, config: AxiosRequestConfig = {}) {
		return this.request({
			...config,
			method: 'DELETE',
			url,
			data: (config || {}).data,
		});
	}

	head(url: string, config: AxiosRequestConfig = {}) {
		return this.request({
			...config,
			method: 'HEAD',
			url,
			data: (config || {}).data,
		});
	}
}

// export
export default {
	create: (config) => new AxiosWrapper(config),
};
