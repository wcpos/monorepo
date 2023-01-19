import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import Dialog from '@wcpos/components/src/dialog';
import Pill from '@wcpos/components/src/pill';
import useHttpClient from '@wcpos/hooks/src/use-http-client';

import useAuth from '../../contexts/auth';
import { t } from '../../lib/translations';

interface Props {
	site: import('@wcpos/database').SiteDocument;
	wpUser: import('@wcpos/database').WPCredentialsDocument;
}

function sanitizeStoreName(id: string) {
	return `store_${id.replace(':', '_')}`;
}

const WpUser = ({ site, wpUser }: Props) => {
	const { login } = useAuth();
	const stores = useObservableSuspense(wpUser.storesResource);
	const http = useHttpClient();
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);

	/**
	 * Populate stores on first render
	 * @TODO - get stores when user first authenticates
	 */
	React.useEffect(() => {
		http
			.get(`${site.getWcposApiUrl()}/stores`, {
				headers: { Authorization: `Bearer ${wpUser.jwt}` },
			})
			.then((response) => {
				// @ts-ignore
				wpUser.addOrUpdateStores(response.data);
			});
	}, []);

	/**
	 *
	 */
	const handleStoreSelect = React.useCallback(() => {
		login({
			siteID: site.localID,
			wpCredentialsID: wpUser.localID,
			storeID: stores[0].localID,
		});
		// const current =
		// if (stores.length === 1) {
		// 	site.collection.upsertLocal('current', { id: site.localID });
		// 	wpUser.collection.upsertLocal('current', { id: wpUser.localID });
		// 	stores[0].collection.upsertLocal('current', { id: stores[0].localID });
		// }
	}, [login, site.localID, stores, wpUser.localID]);

	return (
		<>
			<Pill
				removable
				onPress={handleStoreSelect}
				onRemove={() => setDeleteDialogOpened(true)}
				disabled={stores.length === 0}
			>
				{wpUser.display_name ? wpUser.display_name : 'No name?'}
			</Pill>

			<Dialog
				opened={deleteDialogOpened}
				onAccept={() => site.removeWpCredentials(wpUser)}
				onClose={() => setDeleteDialogOpened(false)}
			>
				{t('Remove user?', { _tags: 'core' })}
			</Dialog>
		</>
	);
};

export default WpUser;
