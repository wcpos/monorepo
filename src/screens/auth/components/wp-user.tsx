import * as React from 'react';
import { View } from 'react-native';

import Dialog from '@wcpos/components/src/dialog';
import Pill from '@wcpos/components/src/pill';

import useLogin from '../../../hooks/use-login';
import { t } from '../../../lib/translations';

interface Props {
	site: import('@wcpos/database').SiteDocument;
	wpUser: import('@wcpos/database').WPCredentialsDocument;
}

const WpUser = ({ site, wpUser }: Props) => {
	const login = useLogin();
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);

	/**
	 *
	 */
	const handleStoreSelect = React.useCallback(async () => {
		const stores = await wpUser.populate('stores');

		if (stores.length === 1) {
			login({
				siteID: site.uuid,
				wpCredentialsID: wpUser.uuid,
				storeID: stores[0].localID,
			});
		}

		/**
		 * TODO - show a popover to select the store
		 * what if there are no stores?
		 */
	}, [login, site.uuid, wpUser]);

	/**
	 * Remove user
	 */
	const handleRemoveWpUser = React.useCallback(async () => {
		try {
			await wpUser.remove();
			await site.incrementalUpdate({
				$pullAll: {
					wp_credentials: [wpUser.uuid],
				},
			});
		} catch (err) {
			throw err;
		}
	}, [wpUser, site]);

	/**
	 *
	 */
	return (
		<>
			<Pill removable onPress={handleStoreSelect} onRemove={() => setDeleteDialogOpened(true)}>
				{wpUser.display_name ? wpUser.display_name : 'No name?'}
			</Pill>

			<Dialog
				opened={deleteDialogOpened}
				onAccept={handleRemoveWpUser}
				onClose={() => setDeleteDialogOpened(false)}
			>
				{t('Remove user?', { _tags: 'core' })}
			</Dialog>
		</>
	);
};

export default WpUser;
