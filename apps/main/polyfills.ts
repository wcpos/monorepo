import * as Crypto from 'expo-crypto';

if (typeof global.crypto === 'undefined') {
	// If global.crypto doesn't exist, create it with a polyfill for getRandomValues.
	global.crypto = {
		getRandomValues: <T extends ArrayBufferView | null>(buffer: T): T => {
			if (!buffer) return buffer;
			const ints = new Uint8Array(buffer.byteLength);
			Crypto.getRandomValues(ints);
			new Uint8Array(buffer.buffer).set(ints);
			return buffer;
		},
	};
}