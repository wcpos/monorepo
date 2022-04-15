import { addRxPlugin } from 'rxdb/plugins/core';
import memoryAdapter from 'pouchdb-adapter-memory';

addRxPlugin(memoryAdapter);

export const config = {
	adapter: 'memory',
	ignoreDuplicate: true,
};
