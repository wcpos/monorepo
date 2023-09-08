import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';

import { Site } from './site';

/**
 *
 */
export const Sites = ({ user }) => {
	const sites = useObservableSuspense(user.populateResource('sites'));

	/**
	 *
	 */
	return (
		<Box
			raised
			rounding="medium"
			// padding="medium"
			// space="medium"
			style={{ width: '100%', backgroundColor: 'white' }}
		>
			{sites.map((site, index) => (
				<ErrorBoundary key={site.uuid}>
					<Site user={user} site={site} idx={index} />
				</ErrorBoundary>
			))}
		</Box>
	);
};
