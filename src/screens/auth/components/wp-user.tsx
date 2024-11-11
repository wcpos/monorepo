import * as React from 'react';
import { View } from 'react-native';

import get from 'lodash/get';
import { useObservableSuspense } from 'observable-hooks';

import {
	AlertDialog,
	AlertDialogHeader,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogTitle,
	AlertDialogFooter,
} from '@wcpos/components/src/alert-dialog';
import { ButtonPill, ButtonText } from '@wcpos/components/src/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectPrimitiveTrigger,
} from '@wcpos/components/src/select';
import { Text } from '@wcpos/components/src/text';
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
					<SelectPrimitiveTrigger asChild>
						<ButtonPill size="xs" removable onRemove={() => setDeleteDialogOpened(true)}>
							<ButtonText>{wpUser.display_name ? wpUser.display_name : 'No name?'}</ButtonText>
						</ButtonPill>
					</SelectPrimitiveTrigger>
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

			<AlertDialog open={deleteDialogOpened} onOpenChange={setDeleteDialogOpened}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t('Remove {name}', { name: wpUser.display_name, _tags: 'core' })}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t(
								'Are you sure you want to remove this user? Removing a user from the POS will not effect any data on the server.',
								{ _tags: 'core' }
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t('Cancel', { _tags: 'core' })}</AlertDialogCancel>
						<AlertDialogAction variant="destructive" onPress={handleRemoveWpUser}>
							{t('Remove', { _tags: 'core' })}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</View>
	);
};

export default WpUser;
