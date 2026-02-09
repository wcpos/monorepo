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
	const stores = useObservableSuspense(
		(
			wpUser as unknown as {
				populateResource: (
					key: string
				) => import('observable-hooks').ObservableResource<
					import('@wcpos/database').StoreDocument[]
				>;
			}
		).populateResource('stores')
	);
	const t = useT();
	const { isValid, isLoading } = useUserValidation({ site, wpUser });

	/**
	 *
	 */
	const handleLogin = React.useCallback(
		async (storeID: string) => {
			if (!storeID) {
				authLogger.error(t('auth.no_store_selected'), {
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
				<Select
					onValueChange={(option) => option && handleLogin(option.value)}
					disabled={!isValid || isLoading}
				>
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
							<SelectItem
								key={store.localID}
								label={store.name ?? ''}
								value={store.localID ?? ''}
							/>
						))}
					</SelectContent>
				</Select>
			) : (
				<ButtonPill
					size="xs"
					onPress={() => {
						const storeID = get(stores, [0, 'localID']) as string | undefined;
						if (storeID) handleLogin(storeID);
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
						<AlertDialogTitle>{t('auth.remove_2', { name: wpUser.display_name })}</AlertDialogTitle>
						<AlertDialogDescription>{t('auth.are_you_sure_you_want_to')}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
						<AlertDialogAction onPress={handleRemoveWpUser}>{t('auth.remove')}</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</View>
	);
};
