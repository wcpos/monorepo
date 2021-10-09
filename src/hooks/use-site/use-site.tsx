import * as React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import { SiteContext } from './site-provider';

const useSite = () => {
	const context = React.useContext(SiteContext);
	if (context === undefined) {
		throw new Error(`useSite must be called within SiteProvider`);
	}

	const { siteResource, sitesResource } = context;
	const site = useObservableSuspense(siteResource);
	const sites = useObservableSuspense(sitesResource);

	return { site, sites, siteResource };
};

export default useSite;
