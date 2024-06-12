import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import semver from 'semver';

interface Props {
	site: import('@wcpos/database').SiteDocument;
}

/**
 *
 */
export const useVersionCheck = ({ site }: Props) => {
	const wcposVersion = useObservableEagerState(site.wcpos_version$);
	const wcposVersionPass = semver.gte(String(semver.coerce(wcposVersion || '0')), '1.6.0');

	return { wcposVersionPass };
};
