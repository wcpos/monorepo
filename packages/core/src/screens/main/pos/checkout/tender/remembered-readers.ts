import * as React from 'react';

import type { PaymentMethodDescriptor } from '@wcpos/order-math';
import {
	observeRememberedReaders,
	type Readers,
	rememberedMode,
	type RememberedReader,
	rememberedReaders,
	type StoreLocalDatabase,
} from '@wcpos/query/store-local';

import { useStoreSession } from '../../../../../contexts/app-state';

export type { RememberedReader } from '@wcpos/query/store-local';

/** Every remembered reader by method id, live. Empty until the state has loaded. */
export function useRememberedReaders(): Readonly<Readers> {
	const { storeDB } = useStoreSession();
	const [readers, setReaders] = React.useState<Readonly<Readers>>({});
	React.useEffect(() => {
		const subscription = observeRememberedReaders(storeDB).subscribe({
			next: setReaders,
			error: () => undefined,
		});
		return () => subscription.unsubscribe();
	}, [storeDB]);
	return readers;
}

/**
 * One method's remembered reader for checkout. A memory from the other connection (a cloud
 * choice on a device-primary method, or the reverse) is not this method's reader: ignored.
 */
export function useRememberedReader(
	methodId: string | null,
	methods: readonly PaymentMethodDescriptor[]
) {
	const { storeDB } = useStoreSession();
	const [loaded, setLoaded] = React.useState<{
		storeDB: StoreLocalDatabase;
		get: (id: string) => RememberedReader | undefined;
	} | null>(null);
	// Load before a tile is tapped; RxDB owns the state, including subsequent confirmed choices.
	React.useEffect(() => {
		let current: Readonly<Readers> = {};
		const loaded = { storeDB, get: (id: string) => current[id] };
		const subscription = observeRememberedReaders(storeDB).subscribe({
			next: (readers) => {
				current = readers;
				setLoaded(loaded);
			},
			error: () => undefined,
		});
		return () => subscription.unsubscribe();
	}, [storeDB]);
	// Stable: both sit in the tender flow's useCallback deps.
	const getLoaded = React.useCallback(
		(id: string | null): string | null => {
			const reader = id && loaded?.storeDB === storeDB ? loaded.get(id) : undefined;
			const mode = methods.find((method) => method.id === id)?.capture.mode;
			return reader && rememberedMode(reader) === mode ? reader.id : null;
		},
		[loaded, storeDB, methods]
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
	const readerId = getLoaded(methodId);
	// The transport it was remembered on: the checkout reconnect scans only that one (roadmap#574).
	const readerTransport = readerId && methodId ? (loaded?.get(methodId)?.transport ?? null) : null;
	return { readerId, readerTransport, getLoaded, remember };
}
