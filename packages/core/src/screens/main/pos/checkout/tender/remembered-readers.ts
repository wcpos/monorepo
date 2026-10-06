import * as React from 'react';

import type { StoreDatabase } from '@wcpos/database';

import { useStoreSession } from '../../../../../contexts/app-state';

import type { ReaderInfo } from '../../../../../services/payment-drivers/types';
import type { RxState } from 'rxdb';

// v2 keeps the reader's label, model, serial and transport beside its id so the Card readers
// settings page can name a remembered reader before the driver has reconnected to it. v1 held
// only `methodId -> readerId`; the lane has no data to carry over, so it is simply not read.
const STATE_NAME = 'terminal-readers_v2';
/** A device reader keeps its transport; a server (cloud) terminal choice has none. */
export type RememberedReader = Pick<ReaderInfo, 'id' | 'label' | 'model' | 'serial'> &
	Partial<Pick<ReaderInfo, 'transport'>>;
type Readers = Record<string, RememberedReader>;

function snapshot(reader: RememberedReader): RememberedReader {
	return {
		id: reader.id,
		label: reader.label,
		model: reader.model,
		serial: reader.serial,
		transport: reader.transport,
	};
}

export function rememberedReaders(storeDB: StoreDatabase) {
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

/** Every remembered reader by method id, live. Empty until the state has loaded. */
export function useRememberedReaders(): Readonly<Readers> {
	const { storeDB } = useStoreSession();
	const [readers, setReaders] = React.useState<Readonly<Readers>>({});
	React.useEffect(() => {
		let active = true;
		let unsubscribe = () => {};
		void storeDB
			.addState<Readers>(STATE_NAME)
			.then((state) => {
				if (!active) return;
				const subscription = state.get$().subscribe((value: Readers | undefined) => {
					if (active) setReaders(pruneEmpty(value));
				});
				unsubscribe = () => subscription.unsubscribe();
			})
			.catch(() => undefined);
		return () => {
			active = false;
			unsubscribe();
		};
	}, [storeDB]);
	return readers;
}

// RxState keeps a removed key as `undefined`; the list wants it gone.
function pruneEmpty(value: Readers | undefined): Readers {
	const next: Readers = {};
	for (const [key, reader] of Object.entries(value ?? {})) if (reader) next[key] = reader;
	return next;
}

export function useRememberedReader(methodId: string | null) {
	const { storeDB } = useStoreSession();
	const [loaded, setLoaded] = React.useState<{
		storeDB: StoreDatabase;
		state: RxState<Readers>;
	} | null>(null);
	// Load before a tile is tapped; RxDB owns the state, including subsequent confirmed choices.
	React.useEffect(() => {
		let active = true;
		void storeDB
			.addState<Readers>(STATE_NAME)
			.then((state) => {
				if (active) setLoaded({ storeDB, state });
			})
			.catch(() => undefined);
		return () => {
			active = false;
		};
	}, [storeDB]);
	// Stable: both sit in the tender flow's useCallback deps.
	const getLoaded = React.useCallback(
		(id: string | null): string | null =>
			id && loaded?.storeDB === storeDB ? (loaded.state.get(id)?.id ?? null) : null,
		[loaded, storeDB]
	);
	const remember = React.useCallback(
		async (reader: RememberedReader): Promise<void> => {
			// A preference that cannot be read or saved must not interrupt a payment.
			if (methodId)
				await rememberedReaders(storeDB)
					.set(methodId, reader)
					.catch(() => undefined);
		},
		[methodId, storeDB]
	);
	return { readerId: getLoaded(methodId), getLoaded, remember };
}
