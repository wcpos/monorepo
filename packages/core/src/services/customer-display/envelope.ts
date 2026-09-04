export interface DisplayEnvelope<T extends object = Record<string, unknown>> {
	wcpos: 1;
	id: string;
	action: string;
	payload: T;
}

function randomBytes(length: number): Uint8Array {
	const crypto = globalThis.crypto;
	if (typeof crypto?.getRandomValues === 'function') {
		return crypto.getRandomValues(new Uint8Array(length));
	}
	// React Native ships no global crypto; expo-crypto bridges the platform CSPRNG. Required lazily
	// so browsers and node never load the native module.
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const expoCrypto = require('expo-crypto') as {
		getRandomValues: (array: Uint8Array) => Uint8Array;
	};
	return expoCrypto.getRandomValues(new Uint8Array(length));
}

/** RFC 4122 v4 id from a cryptographic source; `randomUUID` needs a secure context, `getRandomValues` does not. */
export function uuid(): string {
	const crypto = globalThis.crypto;
	if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
	const bytes = randomBytes(16);
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function makeEnvelope<T extends object>(
	action: string,
	payload: T,
	id = uuid()
): DisplayEnvelope<T> {
	return { wcpos: 1, id, action, payload };
}
