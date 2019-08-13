import axios from 'axios';
import { encode as btoa } from 'base-64';
export const noConfigAxios = axios;

/**
 * React Native does not have global btoa
 */

/**
 * Create axios instance with default config
 */
const instance = axios.create({
	// baseURL: 'https://some-domain.com/api/',
	// timeout: 1000,
	headers: { 'X-WCPOS': '1' },
	transformRequest: [
		(data, headers) => {
			// Do whatever you want to transform the data
			debugger;
			console.log(headers);
			// requestHeaders.Authorization = 'Basic ' + btoa(username + ':' + password);
			return data;
		},
	],
});

export default instance;
