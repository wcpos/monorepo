import * as React from 'react';

import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { Suspense } from '@wcpos/tailwind/src/suspense';

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
