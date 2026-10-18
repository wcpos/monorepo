import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { observeProductMetaKeys, useQueryRuntime } from '@wcpos/query';

/** Discover meta keys from resident products, clearing suggestions while no store is bound. */
export function useProductMetaKeys(): string[] {
	const runtime = useQueryRuntime();
	const keys$ = React.useMemo(() => observeProductMetaKeys(runtime.engine), [runtime.engine]);
	return useObservableState(keys$, []);
}
