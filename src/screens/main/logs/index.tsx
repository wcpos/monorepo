import * as React from 'react';

import { useLocalQuery } from '@wcpos/query';
import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { Suspense } from '@wcpos/tailwind/src/suspense';

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
