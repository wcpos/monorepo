import { addRxPlugin } from 'rxdb/plugins/core';
import idbAdapter from 'pouchdb-adapter-idb';

addRxPlugin(idbAdapter);
