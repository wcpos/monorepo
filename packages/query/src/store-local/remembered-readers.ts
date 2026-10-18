import { defer, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import type { PaymentTransport } from '@wcpos/order-math';

import { storeDatabase } from './ensure-local-document';

import type { StoreLocalDatabase } from '../reads/store-local';

// v2 keeps the reader's label, model, serial and transport beside its id so the Card readers
// settings page can name a remembered reader before the driver has reconnected to it. v1 held
// only `methodId -> readerId`; the lane has no data to carry over, so it is simply not read.
const STATE_NAME = 'terminal-readers_v2';
/** A device reader keeps its transport; a server (cloud) terminal choice has none. */
export type RememberedReader = {
	id: string;
	label: string;
	model?: string;
	serial?: string;
	transport?: PaymentTransport;
};
export type Readers = Record<string, RememberedReader>;

function snapshot(reader: RememberedReader): RememberedReader {
	return {
		id: reader.id,
		label: reader.label,
		model: reader.model,
		serial: reader.serial,
		transport: reader.transport,
	};
}

export function rememberedReaders(database: StoreLocalDatabase) {
	const storeDB = storeDatabase(database);
	return {
		async get(methodId: string): Promise<RememberedReader | null> {
			const state = await storeDB.addState<Readers>(STATE_NAME);
			return state.get(methodId) ?? null;
		},
		async set(methodId: string, reader: RememberedReader): Promise<void> {
			const state = await storeDB.addState<Readers>(STATE_NAME);
			await state.set(methodId, () => snapshot(reader));
		},
		/** Forget: the reader stops reconnecting at the next sale and leaves the settings list. */
		async remove(methodId: string): Promise<void> {
			const state = await storeDB.addState<Readers>(STATE_NAME);
			await state.set(methodId, () => undefined as unknown as RememberedReader);
		},
	};
}

/** Every remembered reader by method id, live; absent database emits {}. */
export function observeRememberedReaders(storeDB: StoreLocalDatabase) {
	return storeDB
		? defer(() => storeDatabase(storeDB).addState<Readers>(STATE_NAME)).pipe(
				switchMap((state) => state.get$()),
				map(pruneEmpty)
			)
		: of<Readers>({});
}

// RxState keeps a removed key as `undefined`; the list wants it gone.
function pruneEmpty(value: Readers | undefined): Readers {
	const next: Readers = {};
	for (const [key, reader] of Object.entries(value ?? {})) if (reader) next[key] = reader;
	return next;
}
