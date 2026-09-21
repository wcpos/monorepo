import * as React from 'react';

import type { StoreDatabase } from '@wcpos/database';

import { useStoreSession } from '../../../../../contexts/app-state';

import type { RxState } from 'rxdb';

const STATE_NAME = 'terminal-readers_v1';
type Readers = Record<string, string>;

export function rememberedReaders(storeDB: StoreDatabase) {
	return {
		async get(methodId: string): Promise<string | null> {
			const state = await storeDB.addState<Readers>(STATE_NAME);
			return state.get(methodId) ?? null;
		},
		async set(methodId: string, readerId: string): Promise<void> {
			const state = await storeDB.addState<Readers>(STATE_NAME);
			await state.set(methodId, () => readerId);
		},
	};
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
			id && loaded?.storeDB === storeDB ? (loaded.state.get(id) ?? null) : null,
		[loaded, storeDB]
	);
	const remember = React.useCallback(
		async (readerId: string): Promise<void> => {
			// A preference that cannot be read or saved must not interrupt a payment.
			if (methodId)
				await rememberedReaders(storeDB)
					.set(methodId, readerId)
					.catch(() => undefined);
		},
		[methodId, storeDB]
	);
	return { readerId: getLoaded(methodId), getLoaded, remember };
}
