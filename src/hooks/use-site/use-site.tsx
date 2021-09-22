import * as React from 'react';
import { SiteContext } from './site-provider';

const useSite = () => {
	const context = React.useContext(SiteContext);
	if (context === undefined) {
		throw new Error(`useSite must be called within SiteProvider`);
	}
	return context;
};

export default useSite;
