import * as React from 'react';

import { observeClosureRegisterNames } from '@wcpos/query/register-session';

import { useStoreSession } from '../../contexts/app-state';
import { useRegisterDirectory } from './use-register-binding';

import type { Subscription } from 'rxjs';

const NO_NAMES: Record<string, string> = Object.freeze({});
/** One closures subscription per store database, shared by every reader (one per table cell). */
const closureNames = new WeakMap<
	object,
	{ names: Record<string, string>; listeners: Set<() => void>; subscription?: Subscription }
>();

/** Names this device's closures recorded, so a retired register keeps its name. */
function useClosureRegisterNames(
	storeDB: Parameters<typeof observeClosureRegisterNames>[0]
): Record<string, string> {
	const subscribe = React.useCallback(
		(notify: () => void) => {
			if (!storeDB) return () => {};
			const current = closureNames.get(storeDB) ?? { names: NO_NAMES, listeners: new Set() };
			closureNames.set(storeDB, current);
			current.listeners.add(notify);
			current.subscription ??= observeClosureRegisterNames(storeDB).subscribe((names) => {
				current.names = names;
				current.listeners.forEach((listener) => listener());
			});
			return () => {
				current.listeners.delete(notify);
				if (current.listeners.size) return;
				current.subscription?.unsubscribe();
				current.subscription = undefined;
			};
		},
		[storeDB]
	);
	const snapshot = React.useCallback(
		() => (storeDB && closureNames.get(storeDB)?.names) || NO_NAMES,
		[storeDB]
	);
	return React.useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Register id → name for a store: the viewed store when given, otherwise the till's. */
export function useRegisterNames(storeId?: number): Record<string, string> {
	const { store, storeDB } = useStoreSession();
	const { registers } = useRegisterDirectory(storeId ?? store.id);
	const snapshotNames = useClosureRegisterNames(storeDB);
	return React.useMemo(
		() => ({
			...snapshotNames,
			...Object.fromEntries(registers.map(({ id, name }) => [id, name])),
		}),
		[registers, snapshotNames]
	);
}

/** Whether that store's register list has settled (read, or its read failed): nothing more is
 * coming for now, so a reader waiting for names stops waiting. */
export function useRegisterNamesReady(storeId?: number): boolean {
	const { store } = useStoreSession();
	const { loaded, failed } = useRegisterDirectory(storeId ?? store.id);
	return loaded || failed;
}
