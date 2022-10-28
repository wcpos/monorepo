/**
 * Axios assumes global.btoa for Basic Auth
 * We need to polyfill here for React Native
 */
import { decode, encode } from 'js-base64';
import axios from 'axios';

if (!global.btoa) {
	global.btoa = encode;
}

if (!global.atob) {
	global.atob = decode;
}

export default axios;
