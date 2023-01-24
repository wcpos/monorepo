import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';

import Site from './site';
import useAuth from '../../../contexts/auth';

export const SitesList = () => {
	const { user } = useAuth();
	const sites = useObservableSuspense(user.sitesResource);

	if (!Array.isArray(sites) || sites.length === 0) {
		return null;
	}

	return (
		<Box
			raised
			rounding="medium"
			// padding="medium"
			// space="medium"
			style={{ width: '100%', backgroundColor: 'white' }}
		>
			{sites.map((site, index) => (
				<ErrorBoundary key={site.localID}>
					<Site site={site} user={user} first={index === 0} />
				</ErrorBoundary>
			))}
		</Box>
	);
};

export default SitesList;
