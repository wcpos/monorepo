import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { markLogsRead, observeUnreadErrorCount } from '@wcpos/query/store-local';

import { useAppState } from '../../../../contexts/app-state';

/**
 * Count of error-level logs newer than the persisted last-viewed watermark.
 * markAsRead() advances the watermark (the logs route calls it on focus).
 */
export function useUnreadErrorCount() {
	const { storeDB } = useAppState();
	const count = useObservableState(
		React.useMemo(() => observeUnreadErrorCount(storeDB), [storeDB]),
		0
	);
	const markAsRead = React.useCallback(() => {
		void markLogsRead(storeDB).catch(() => undefined);
	}, [storeDB]);
	return { count, markAsRead };
}
