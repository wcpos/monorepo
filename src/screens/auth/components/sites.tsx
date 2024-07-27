import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { Card } from '@wcpos/tailwind/src/card';
import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';

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
		<Card className="w-full">
			{sites.map((site, index) => (
				<ErrorBoundary key={site.uuid}>
					<Site user={user} site={site} idx={index} />
				</ErrorBoundary>
			))}
		</Card>
	);
};
