import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';

import Site from './site';

export const SitesList = ({ sitesResource }) => {
	const sites = useObservableSuspense(sitesResource);

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
				<ErrorBoundary key={site.uuid}>
					<Site site={site} first={index === 0} />
				</ErrorBoundary>
			))}
		</Box>
	);
};

export default SitesList;
