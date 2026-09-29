import * as React from 'react';

import { useStoreSession } from '../../contexts/app-state';
import { useRegisterDirectory } from './use-register-binding';

/** Register id → name for a store: the viewed store when given, otherwise the till's. */
export function useRegisterNames(storeId?: number): Record<string, string> {
	const { store } = useStoreSession();
	const { registers } = useRegisterDirectory(storeId ?? store.id);
	return React.useMemo(
		() => Object.fromEntries(registers.map(({ id, name }) => [id, name])),
		[registers]
	);
}
