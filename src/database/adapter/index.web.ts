import { addRxPlugin } from 'rxdb/plugins/core';
import idbAdapter from 'pouchdb-adapter-idb';

addRxPlugin(idbAdapter);

export const config = {
	adapter: 'idb',
	ignoreDuplicate: process.env.NODE_ENV === 'development',
};
