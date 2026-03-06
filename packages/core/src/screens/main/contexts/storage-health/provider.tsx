import * as React from 'react';

import { getStorageHealthSnapshot, storageHealth$, type StorageHealthState } from '@wcpos/database';
import { useQueryManager } from '@wcpos/query';

const initialState: StorageHealthState = getStorageHealthSnapshot();

type StorageHealthContextValue = StorageHealthState & {
	isDegraded: boolean;
};

const StorageHealthContext = React.createContext<StorageHealthContextValue>({
	...initialState,
	isDegraded: initialState.status === 'degraded',
});

export function StorageHealthProvider({ children }: { children: React.ReactNode }) {
	const manager = useQueryManager();
	const [state, setState] = React.useState<StorageHealthState>(() => getStorageHealthSnapshot());

	React.useEffect(() => {
		const sub = storageHealth$.subscribe((nextState) => {
			setState(nextState);
		});

		return () => sub.unsubscribe();
	}, []);

	React.useEffect(() => {
		if (state.status === 'degraded') {
			manager.pauseAllReplications('storage-health');
		}
	}, [manager, state.status]);

	const value = React.useMemo(
		() => ({
			...state,
			isDegraded: state.status === 'degraded',
		}),
		[state]
	);

	return React.createElement(StorageHealthContext.Provider, { value }, children);
}

export function useStorageHealth() {
	return React.useContext(StorageHealthContext);
}
