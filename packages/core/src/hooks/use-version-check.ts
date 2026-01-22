import type { SiteDocument } from '@wcpos/database';

import { useAppInfo } from './use-app-info';

interface Props {
	site: SiteDocument;
}

/**
 * Check if the WCPOS plugin version on the server meets the minimum requirement.
 * Uses the current app version as the minimum required plugin version.
 *
 * @deprecated Use `useAppInfo({ site }).compatibility` instead
 */
export const useVersionCheck = ({ site }: Props) => {
	const { compatibility } = useAppInfo({ site });

	return { wcposVersionPass: compatibility?.wcposVersionPass ?? false };
};
