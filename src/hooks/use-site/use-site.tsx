import * as React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import { SiteContext } from './site-provider';

const useSite = () => {
	const context = React.useContext(SiteContext);
	if (context === undefined) {
		throw new Error(`useSite must be called within SiteProvider`);
	}

	const { siteResource } = context;
	const site = useObservableSuspense(siteResource);

	return { site, siteResource };
};

export default useSite;
