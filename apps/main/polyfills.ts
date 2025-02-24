import * as Crypto from 'expo-crypto';

if (typeof global.crypto === 'undefined') {
	global.crypto = {
		getRandomValues: Crypto.getRandomValues,
		randomUUID: Crypto.randomUUID,
		subtle: {
			digest: Crypto.digest,
		},
	};
}
