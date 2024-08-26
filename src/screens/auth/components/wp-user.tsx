import * as React from 'react';
import { View } from 'react-native';

import get from 'lodash/get';
import { useObservableSuspense } from 'observable-hooks';

import { ButtonPill, ButtonText } from '@wcpos/components/src/button';
import { Dialog, DialogContent } from '@wcpos/components/src/dialog';
import { Select, SelectContent, SelectItem, SelectPrimitive } from '@wcpos/components/src/select';
import { Toast } from '@wcpos/components/src/toast';

import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';

interface Props {
	site: import('@wcpos/database').SiteDocument;
	wpUser: import('@wcpos/database').WPCredentialsDocument;
}

const WpUser = ({ site, wpUser }: Props) => {
	const { login } = useAppState();
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const stores = useObservableSuspense(wpUser.populateResource('stores'));
	const t = useT();

	/**
	 *
	 */
	const handleLogin = React.useCallback(
		async (storeID: string) => {
			if (!storeID) {
				Toast.show({
					type: 'error',
					text1: t('No store selected', { _tags: 'core' }),
				});
			}
			login({
				siteID: site.uuid,
				wpCredentialsID: wpUser.uuid,
				storeID,
			});
		},
		[login, site.uuid, t, wpUser.uuid]
	);

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
		<View>
			{stores.length > 1 ? (
				<Select onValueChange={({ value }) => handleLogin(value)}>
					<SelectPrimitive.Trigger asChild>
						<ButtonPill size="xs" removable onRemove={() => setDeleteDialogOpened(true)}>
							<ButtonText>{wpUser.display_name ? wpUser.display_name : 'No name?'}</ButtonText>
						</ButtonPill>
					</SelectPrimitive.Trigger>
					<SelectContent>
						{stores.map((store) => (
							<SelectItem key={store.localID} label={store.name} value={store.localID} />
						))}
					</SelectContent>
				</Select>
			) : (
				<ButtonPill
					size="xs"
					onPress={() => {
						const storeID = get(stores, [0, 'localID']);
						handleLogin(storeID);
					}}
					removable
					onRemove={() => setDeleteDialogOpened(true)}
				>
					<ButtonText>{wpUser.display_name ? wpUser.display_name : 'No name?'}</ButtonText>
				</ButtonPill>
			)}

			<Dialog
				open={deleteDialogOpened}
				onAccept={handleRemoveWpUser}
				onOpenChange={setDeleteDialogOpened}
			>
				<DialogContent>{t('Remove user?', { _tags: 'core' })}</DialogContent>
			</Dialog>
		</View>
	);
};

export default WpUser;
