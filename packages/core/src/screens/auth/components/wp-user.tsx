import * as React from 'react';
import { View } from 'react-native';

import get from 'lodash/get';
import { useObservableSuspense } from 'observable-hooks';

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@wcpos/components/alert-dialog';
import { ButtonPill, ButtonText } from '@wcpos/components/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectPrimitiveTrigger,
} from '@wcpos/components/select';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { useUserValidation } from '../../../hooks/use-user-validation';

const authLogger = getLogger(['wcpos', 'auth', 'user']);

interface Props {
	site: import('@wcpos/database').SiteDocument;
	wpUser: import('@wcpos/database').WPCredentialsDocument;
}

export const WpUser = ({ site, wpUser }: Props) => {
	const { login } = useAppState();
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const stores = useObservableSuspense(wpUser.populateResource('stores'));
	const t = useT();
	const { isValid, isLoading } = useUserValidation({ site, wpUser });

	/**
	 *
	 */
	const handleLogin = React.useCallback(
		async (storeID: string) => {
			if (!storeID) {
				authLogger.error(t('No store selected'), {
					showToast: true,
					context: {
						errorCode: ERROR_CODES.MISSING_REQUIRED_PARAMETERS,
						siteId: site.uuid,
						userId: wpUser.uuid,
					},
				});
				return;
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
			await wpUser.incrementalRemove();
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
			{Array.isArray(stores) && stores.length > 1 ? (
				<Select onValueChange={({ value }) => handleLogin(value)} disabled={!isValid || isLoading}>
					<SelectPrimitiveTrigger asChild>
						<ButtonPill
							size="xs"
							removable
							onRemove={() => setDeleteDialogOpened(true)}
							disabled={isLoading}
						>
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
					disabled={isLoading}
				>
					<ButtonText>{wpUser.display_name ? wpUser.display_name : 'No name?'}</ButtonText>
				</ButtonPill>
			)}

			<AlertDialog open={deleteDialogOpened} onOpenChange={setDeleteDialogOpened}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t('Remove {name}', { name: wpUser.display_name })}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t(
								'Are you sure you want to remove this user? Removing a user from the POS will not effect any data on the server.'
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
						<AlertDialogAction onPress={handleRemoveWpUser}>
							{t('Remove')}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</View>
	);
};
