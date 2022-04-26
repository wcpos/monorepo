import { addRxPlugin } from 'rxdb';
import memoryAdapter from 'pouchdb-adapter-memory';

addRxPlugin(memoryAdapter);

export const config = {
	adapter: 'memory',
	ignoreDuplicate: true,
};
