// Polyfill TextEncoder/TextDecoder for RxDB in jsdom environment
import { TextEncoder, TextDecoder } from 'util';
import { webcrypto } from 'crypto';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Polyfill crypto.subtle for RxDB hashing
// jsdom provides crypto but not crypto.subtle
Object.defineProperty(global, 'crypto', {
	value: webcrypto,
	writable: true,
	configurable: true,
});
