import { useObservableEagerState } from 'observable-hooks';
import semver from 'semver';

import AppInfo from '@wcpos/utils/app-info';

interface Props {
	site: import('@wcpos/database').SiteDocument;
}

/**
 * Check if the WooCommerce POS plugin version on the server meets the minimum requirement.
 * Uses the current app version as the minimum required plugin version.
 */
export const useVersionCheck = ({ site }: Props) => {
	const wcposVersion = useObservableEagerState(site.wcpos_version$);
	const wcposVersionPass = semver.gte(
		String(semver.coerce(wcposVersion || '0')),
		AppInfo.version
	);

	return { wcposVersionPass };
};
