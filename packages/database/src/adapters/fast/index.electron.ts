import * as Crypto from 'expo-crypto';

import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';
import { getMemoryMappedRxStorage } from 'rxdb-premium/plugins/storage-memory-mapped';

import { storage } from '../default';

const fastStorage = getMemoryMappedRxStorage({
	storage,
});

const devStorage = wrappedValidateZSchemaStorage({
	storage: fastStorage,
});

export const fastStorageConfig = {
	storage: __DEV__ ? devStorage : fastStorage,
	hashFunction: async (i: string) => {
		return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, i);
	},
};
