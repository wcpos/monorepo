import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Dialog from '@wcpos/components/src/dialog';
import Modal from '@wcpos/components/src/modal';
import Pill from '@wcpos/components/src/pill';
import useSnackbar from '@wcpos/components/src/snackbar';

import StoreSelect from './store-select';
import useLogin from '../../../hooks/use-login';
import { t } from '../../../lib/translations';

interface Props {
	site: import('@wcpos/database').SiteDocument;
	wpUser: import('@wcpos/database').WPCredentialsDocument;
}

const WpUser = ({ site, wpUser }: Props) => {
	const login = useLogin();
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const [storeSelectModalOpened, setStoreSelectModalOpened] = React.useState(false);
	const addSnackbar = useSnackbar();
	const [stores] = useObservableState(() => wpUser.populate$('stores'), []);

	/**
	 *
	 */
	const handleLogin = React.useCallback(
		async (storeID) => {
			login({
				siteID: site.uuid,
				wpCredentialsID: wpUser.uuid,
				storeID,
			});
		},
		[login, site.uuid, wpUser.uuid]
	);

	/**
	 *
	 */
	const handleStoreSelect = React.useCallback(async () => {
		if (stores.length === 1) {
			// simple login
			return handleLogin(stores[0].localID);
		} else if (stores.length > 1) {
			// show store select modal
			setStoreSelectModalOpened(true);
		} else {
			addSnackbar({
				message: t('No stores found for this user', { _tags: 'core' }),
			});
		}
	}, [addSnackbar, handleLogin, stores]);

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

			<Modal
				title={t('Select a Store', { _tags: 'core' })}
				onClose={() => setStoreSelectModalOpened(false)}
				opened={storeSelectModalOpened}
			>
				<StoreSelect stores={stores} onSelect={handleLogin} />
			</Modal>
		</>
	);
};

export default WpUser;
