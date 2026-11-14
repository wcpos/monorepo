import * as Crypto from 'expo-crypto';

import { getWorkletFs, installWorkletFs } from '@wcpos/react-native-worklet-fs';
import { installWorkletRuntimePolyfills } from '@wcpos/worklet-opfs';
export function installPolyfills() {
	const globals = globalThis as unknown as {
		crypto?: { subtle?: { digest: typeof Crypto.digest } };
		structuredClone?: <T>(value: T) => T;
	};
	globals.crypto ??= {};
	globals.crypto.subtle ??= { digest: Crypto.digest };
	installWorkletFs();
	installWorkletRuntimePolyfills({ fs: getWorkletFs() });
	// RxDB utils-blob fetches base64 data URLs; Expo's Android fetch rejects that scheme.
	const fetch = globalThis.fetch;
	globalThis.fetch = async (input, init) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		const data = /^data:([^,]*);base64,([\s\S]*)$/.exec(url);
		if (!data) return fetch(input, init);
		const blob = new Blob([Uint8Array.from(atob(data[2]), (char) => char.charCodeAt(0))], {
			type: data[1],
		});
		const response = new Response(null, { headers: { 'Content-Type': blob.type } });
		response.blob = async () => blob;
		return response;
	};
	// The benchmark clones only JSON fixtures; RN Hermes does not expose structuredClone.
	globals.structuredClone ??= <T>(value: T): T => JSON.parse(JSON.stringify(value));
}
