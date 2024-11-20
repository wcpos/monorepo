/**
 * Axios assumes global.btoa for Basic Auth
 * We need to polyfill here for React Native
 */
import axios from 'axios';
import { decode, encode } from 'js-base64';

if (!global.btoa) {
	global.btoa = encode;
}

if (!global.atob) {
	global.atob = decode;
}

export default axios;
