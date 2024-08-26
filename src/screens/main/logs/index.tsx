import * as React from 'react';

import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { Suspense } from '@wcpos/components/src/suspense';

import { Logs } from './logs';

/**
 *
 */
export const LogsWithProviders = () => {
	return (
		<ErrorBoundary>
			<Suspense>
				<Logs />
			</Suspense>
		</ErrorBoundary>
	);
};
