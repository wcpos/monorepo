import * as Crypto from 'expo-crypto';
import { decode, encode } from 'js-base64';
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
	global.Blob = Blob;
}
