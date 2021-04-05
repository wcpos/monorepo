import axios from 'axios';
// import { encode as btoa } from 'base-64';

export const noConfigAxios = axios;

/**
 * Create axios instance with default config
 */
const http = axios.create({
	// baseURL: 'https://dev.local/wp/latest/wp-json/wc/v3/',
	// baseURL: 'https://wcposdev.wpengine.com/wp-json/wc/v3/',
	baseURL: 'http://localhost:8888/wp-json/wc/v3/',
	// timeout: 1000,
	// headers: { 'X-WCPOS': '1' },
});

http.interceptors.request.use(
	function (config) {
		if (config.method !== 'head') {
			config.headers['X-WCPOS'] = 1;
		}
		// if (config.auth) {
		// 	config.headers.Authorization = `Basic ${btoa(
		// 		`${config.auth.username}:${config.auth.password}`
		// 	)}`;
		// 	config.auth = undefined;
		// } else {
		config.auth = undefined;
		config.headers.Authorization =
			'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJodHRwOlwvXC9sb2NhbGhvc3Q6ODg4OCIsImlhdCI6MTYxNzYyNDc2NSwibmJmIjoxNjE3NjI0NzY1LCJleHAiOjE2MTgyMjk1NjUsImRhdGEiOnsidXNlciI6eyJpZCI6IjEifX19.5EUHC-jnGipZjaq39CmmFSMW_S0g2Z52MLcYyfiWy7M';
		// }
		// debugger;
		return config;
	},
	function (error) {
		debugger;
		return Promise.reject(error);
	}
);

Object.assign(http, { CancelToken: axios.CancelToken, isCancel: axios.isCancel });
// http.CancelToken = axios.CancelToken;
// http.isCancel = axios.isCancel;

export default http;
