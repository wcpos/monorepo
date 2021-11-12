import axios from 'axios';

export const noConfigAxios = axios;

const user = {
	key: 'ck_3a5b30b5570a020fa613a7be5cdfc516c21e8371',
	secret: 'cs_a57adc1116df21dac39a0483cd635f2d3becfb6b',
};

/**
 * React Native does not have global btoa
 */

/**
 * Create axios instance with default config
 */
const http = axios.create({
	// baseURL: 'https://wcposdev.wpengine.com/wp-json/wc/v3/',
	// timeout: 1000,
	// headers: { 'X-WCPOS': '1' },
});

http.interceptors.request.use(
	function (config) {
		config.headers = config.headers || {};
		if (config.method !== 'head') {
			config.headers['X-WCPOS'] = '1';
		}
		return config;
	},
	function (error) {
		debugger;
		return Promise.reject(error);
	}
);

Object.assign(http, { CancelToken: axios.CancelToken, isCancel: axios.isCancel });

export default http;
