import * as Crypto from 'expo-crypto';
import { decode, encode, toUint8Array } from 'js-base64';
import { Blob } from 'expo-blob';

if (typeof global.crypto === 'undefined') {
	global.crypto = {
		getRandomValues: Crypto.getRandomValues as Crypto['getRandomValues'],
		randomUUID: Crypto.randomUUID as Crypto['randomUUID'],
		subtle: {
			digest: Crypto.digest,
		},
	} as unknown as Crypto;
}

if (!global.btoa) {
	global.btoa = encode;
}

if (!global.atob) {
	global.atob = decode;
}

if (!global.Blob) {
	global.Blob = Blob as unknown as typeof globalThis.Blob;
}

// RxDB attachments fetch base64 data URLs, which Expo's native fetch cannot read.
const installedFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
	const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
	const data = /^data:([^,]*);base64,([\s\S]*)$/.exec(url);
	if (!data) return installedFetch(input, init);
	// Decode bytes directly: the app's js-base64 `decode`/atob fallback decodes UTF-8 text.
	const blob = new Blob([toUint8Array(data[2])], { type: data[1] });
	const response = new Response(null, { headers: { 'Content-Type': blob.type } });
	response.blob = async () => blob;
	return response;
};
