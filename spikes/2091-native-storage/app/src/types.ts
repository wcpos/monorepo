import type { RxDocumentData, RxStorageInstance } from 'rxdb/plugins/core';
import type { Order, Product } from './fixtures';
// The workload has these concrete shapes; the shared storage handle is erased only at open.
export type Doc = Omit<Product, 'remoteId'> &
	Omit<Order, 'remoteId'> & { remoteId: string | number } & {
		id: string;
		tx: number;
		collection: string;
		operation: string;
		createdAt: number;
	};
export type Instance<T = Doc> = RxStorageInstance<T, unknown, unknown, unknown>;
export type Document<T = Doc> = RxDocumentData<T>;
export type Row = 'expo-filesystem-js' | 'worklet-filesystem' | 'expo-sqlite';
export type Job = {
	id: string;
	type: string;
	row: Row;
	scale?: 'small' | 'large';
	dir: string;
	db: string;
	simulator: boolean;
	snapshot?: import('./ledger').Snapshot;
};
export type Send = (event: Record<string, unknown>) => Promise<void>;
export type Cell = {
	name: string;
	samples: { ms: number; rows?: number }[];
	signatures: string[];
	setSignatures: string[];
	unsortedSamples: number;
	idSets?: string[][];
	docHashes?: [string, string][][];
};
