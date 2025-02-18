import * as Crypto from 'expo-crypto';

// Polyfill implementation for subtle.digest
// Note: This is only needed for DEV because of the RxDB schema validation
const subtlePolyfill = {
	async digest(algorithm: string, data: BufferSource): Promise<ArrayBuffer> {
		// Convert BufferSource to ArrayBuffer
		let dataBuffer: ArrayBuffer;
		if (data instanceof ArrayBuffer) {
			dataBuffer = data;
		} else if (ArrayBuffer.isView(data)) {
			dataBuffer = data.buffer;
		} else {
			throw new Error('Unsupported data type for digest');
		}

		// Convert ArrayBuffer to a UTF-8 string.
		// WARNING: This assumes that the input is valid UTF-8.
		const decoded = new TextDecoder().decode(dataBuffer);

		// Calculate digest as a hex string using Expo Crypto.
		const digestHex = await Crypto.digestStringAsync(algorithm, decoded);

		// Convert hex string back to ArrayBuffer.
		const buffer = new ArrayBuffer(digestHex.length / 2);
		const view = new Uint8Array(buffer);
		for (let i = 0; i < digestHex.length; i += 2) {
			view[i / 2] = parseInt(digestHex.substr(i, 2), 16);
		}
		return buffer;
	},
};

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
		// Only include subtle polyfill in the __DEV__ environment.
		...(__DEV__ ? { subtle: subtlePolyfill } : {}),
	};
} else if (__DEV__ && typeof global.crypto.subtle === 'undefined') {
	// If global.crypto exists but subtle is missing and we're in __DEV__,
	// add the subtle polyfill.
	global.crypto.subtle = subtlePolyfill;
}