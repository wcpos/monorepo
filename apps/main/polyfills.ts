import * as Crypto from 'expo-crypto';

// Polyfill for global.crypto if it doesn't exist.
if (typeof global.crypto === 'undefined') {
	global.crypto = {
		// Polyfill getRandomValues
		getRandomValues: <T extends ArrayBufferView | null>(buffer: T): T => {
			if (!buffer) return buffer;
			const ints = new Uint8Array(buffer.byteLength);
			Crypto.getRandomValues(ints);
			new Uint8Array(buffer.buffer).set(ints);
			return buffer;
		},
		// Polyfill subtle if missing
		subtle: {
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

				// Convert hex string back to ArrayBuffer
				const buffer = new ArrayBuffer(digestHex.length / 2);
				const view = new Uint8Array(buffer);
				for (let i = 0; i < digestHex.length; i += 2) {
					view[i / 2] = parseInt(digestHex.substr(i, 2), 16);
				}
				return buffer;
			},
		},
	};
} else if (typeof global.crypto.subtle === 'undefined') {
	// If crypto exists but crypto.subtle is missing, add the subtle polyfill.
	global.crypto.subtle = {
		async digest(algorithm: string, data: BufferSource): Promise<ArrayBuffer> {
			let dataBuffer: ArrayBuffer;
			if (data instanceof ArrayBuffer) {
				dataBuffer = data;
			} else if (ArrayBuffer.isView(data)) {
				dataBuffer = data.buffer;
			} else {
				throw new Error('Unsupported data type for digest');
			}

			const decoded = new TextDecoder().decode(dataBuffer);
			const digestHex = await Crypto.digestStringAsync(algorithm, decoded);
			const buffer = new ArrayBuffer(digestHex.length / 2);
			const view = new Uint8Array(buffer);
			for (let i = 0; i < digestHex.length; i += 2) {
				view[i / 2] = parseInt(digestHex.substr(i, 2), 16);
			}
			return buffer;
		},
	};
}