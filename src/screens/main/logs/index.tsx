import * as React from 'react';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';
import { useLocalQuery } from '@wcpos/query';

import { Logs } from './logs';
import { useUISettings } from '../contexts/ui-settings';

export const LogsWithProviders = () => {
	const { uiSettings } = useUISettings('logs');

	/**
	 *
	 */
	const query = useLocalQuery({
		queryKeys: ['logs'],
		collectionName: 'logs',
		initialParams: {
			sortBy: uiSettings.sortBy,
			sortDirection: uiSettings.sortDirection,
		},
	});

	return (
		<ErrorBoundary>
			<Suspense>
				<Logs query={query} />
			</Suspense>
		</ErrorBoundary>
	);
};
